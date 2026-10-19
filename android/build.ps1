param(
  [string]$Sdk = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$Jdk = $env:ALLOT_JDK8,
  [string]$RuntimeJdk = $env:JAVA_HOME,
  [string]$WebRoot = '',
  [string]$ApkName = '',
  [switch]$Release,
  [string]$Keystore = $env:ALLOT_KEYSTORE,
  [string]$KeyAlias = 'allot',
  [string]$ApplicationId = ''
)
$ErrorActionPreference = 'Stop'
if (!$ApkName) { $ApkName = if ($Release) { 'Allot-release.apk' } else { 'Allot-debug.apk' } }
if (!$ApplicationId) { $ApplicationId = if ($Release) { 'app.allot.mobile' } else { 'app.allot.personal' } }
if ($ApplicationId -notmatch '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$') { throw 'Invalid application ID' }
if ($Release -and (!(Test-Path -LiteralPath $Keystore -PathType Leaf) -or !$env:ALLOT_SIGNING_STORE_PASSWORD -or !$env:ALLOT_SIGNING_KEY_PASSWORD)) { throw 'Release requires a private keystore and ALLOT_SIGNING_STORE_PASSWORD / ALLOT_SIGNING_KEY_PASSWORD.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
if (!$WebRoot) { $WebRoot = Join-Path $projectRoot 'dist\web' }
$WebRoot = (Resolve-Path -LiteralPath $WebRoot).Path
if (!(Test-Path -LiteralPath (Join-Path $WebRoot 'index.html'))) { throw 'Build the web assets first: npm run build' }
if ([IO.Path]::GetFileName($ApkName) -ne $ApkName -or !$ApkName.EndsWith('.apk')) { throw 'ApkName must be a plain .apk file name' }
$build = Join-Path $PSScriptRoot 'build'
$tools = Join-Path $Sdk 'build-tools\34.0.0'
$androidJar = Join-Path $Sdk 'platforms\android-34\android.jar'
if (!(Test-Path -LiteralPath $androidJar) -or !(Test-Path -LiteralPath "$Jdk\bin\javac.exe") -or !(Test-Path -LiteralPath "$RuntimeJdk\bin\java.exe")) { throw 'Specify SDK 34, JDK 8, and runtime JDK 17+ with -Sdk / -Jdk / -RuntimeJdk.' }
$env:JAVA_HOME = $Jdk
$env:PATH = "$Jdk\bin;$env:PATH"
New-Item -ItemType Directory -Force -Path $build,"$build\generated","$build\classes","$build\dex" | Out-Null
function Run-Checked([string]$Command, [string[]]$Arguments) { & $Command @Arguments; if ($LASTEXITCODE -ne 0) { throw "$Command failed ($LASTEXITCODE)" } }
Run-Checked "$tools\aapt2.exe" @('compile','--dir',"$PSScriptRoot\res",'-o',"$build\resources.zip")
$manifest = Get-Content -LiteralPath "$PSScriptRoot\AndroidManifest.xml" -Raw
$manifest = $manifest.Replace('package="app.allot.personal"', ('package="' + $ApplicationId + '"')).Replace('android:name=".MainActivity"', 'android:name="app.allot.personal.MainActivity"')
if ($Release) { $manifest = $manifest.Replace('android:debuggable="true"', 'android:debuggable="false"') }
$manifestPath = Join-Path $build 'AndroidManifest.xml'
[IO.File]::WriteAllText($manifestPath, $manifest, [Text.UTF8Encoding]::new($false))
Run-Checked "$tools\aapt2.exe" @('link','-o',"$build\resources.apk",'--manifest',$manifestPath,'-I',$androidJar,'-A',$WebRoot,'--java',"$build\generated",'--auto-add-overlay',"$build\resources.zip")
$sources = @(Get-ChildItem -LiteralPath "$PSScriptRoot\src","$build\generated" -Recurse -Filter '*.java' | ForEach-Object FullName)
Run-Checked "$Jdk\bin\javac.exe" (@('-source','8','-target','8','-encoding','UTF-8','-classpath',$androidJar,'-d',"$build\classes") + $sources)
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
if (Test-Path -LiteralPath "$build\classes.jar") { Remove-Item -LiteralPath "$build\classes.jar" }
$classArchive = [IO.Compression.ZipFile]::Open("$build\classes.jar", [IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -LiteralPath "$build\classes" -Recurse -File | ForEach-Object {
    $entryName = $_.FullName.Substring("$build\classes\".Length).Replace('\','/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($classArchive, $_.FullName, $entryName) | Out-Null
  }
} finally { $classArchive.Dispose() }
$env:JAVA_HOME = $RuntimeJdk
Run-Checked "$tools\d8.bat" @('--min-api','26','--lib',$androidJar,'--output',"$build\dex","$build\classes.jar")
Copy-Item -LiteralPath "$build\resources.apk" -Destination "$build\unsigned.apk" -Force
$archive = [IO.Compression.ZipFile]::Open("$build\unsigned.apk", [IO.Compression.ZipArchiveMode]::Update)
try {
  # Windows aapt2 can store nested assets with backslashes; Android asset URLs use '/'.
  foreach ($entry in @($archive.Entries | Where-Object { $_.FullName.Contains('\') })) {
    $entryName = $entry.FullName.Replace('\', '/')
    if ($archive.GetEntry($entryName)) { throw "Duplicate APK asset: $entryName" }
    $buffer = [IO.MemoryStream]::new()
    $inputStream = $entry.Open()
    try { $inputStream.CopyTo($buffer) } finally { $inputStream.Dispose() }
    $entry.Delete()
    $replacement = $archive.CreateEntry($entryName)
    $outputStream = $replacement.Open()
    try { $buffer.Position = 0; $buffer.CopyTo($outputStream) } finally { $outputStream.Dispose(); $buffer.Dispose() }
  }
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, "$build\dex\classes.dex", 'classes.dex') | Out-Null
  $webIndex = Get-Content -LiteralPath (Join-Path $WebRoot 'index.html') -Raw
  $requiredAssets = @('assets/index.html') + @([regex]::Matches($webIndex, '(?:src|href)="([^"?#]+\.(?:js|mjs|css))"') | ForEach-Object { 'assets/' + $_.Groups[1].Value.TrimStart('./') })
  foreach ($asset in $requiredAssets) {
    if (!$archive.GetEntry($asset)) { throw "Required APK asset missing: $asset" }
  }
} finally { $archive.Dispose() }
Run-Checked "$tools\zipalign.exe" @('-f','4',"$build\unsigned.apk","$build\aligned.apk")
if ($Release) {
  $signingArgs = @('--ks',$Keystore,'--ks-key-alias',$KeyAlias,'--ks-pass','env:ALLOT_SIGNING_STORE_PASSWORD','--key-pass','env:ALLOT_SIGNING_KEY_PASSWORD')
} else {
  $debugKeystore = Join-Path $env:USERPROFILE '.android\debug.keystore'
  if (!(Test-Path -LiteralPath $debugKeystore)) { Run-Checked "$Jdk\bin\keytool.exe" @('-genkeypair','-keystore',$debugKeystore,'-storepass','android','-keypass','android','-alias','androiddebugkey','-dname','CN=Android Debug,O=Android,C=US','-keyalg','RSA','-keysize','2048','-validity','10000') }
  $signingArgs = @('--ks',$debugKeystore,'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android')
}
New-Item -ItemType Directory -Force -Path "$projectRoot\dist" | Out-Null
Run-Checked "$tools\apksigner.bat" (@('sign') + $signingArgs + @('--out',"$projectRoot\dist\$ApkName","$build\aligned.apk"))
Run-Checked "$tools\apksigner.bat" @('verify','--verbose',"$projectRoot\dist\$ApkName")
Write-Output "APK: $projectRoot\dist\$ApkName"

