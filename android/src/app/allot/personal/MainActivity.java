package app.allot.personal;

import android.app.Activity;
import android.content.Intent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.HapticFeedbackConstants;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
  private WebView web;
  private SharedPreferences prefs;
  private ValueCallback<Uri[]> fileCallback;
  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  private static final String HOST = "appassets.androidplatform.net";
  @Override public void onCreate(Bundle saved) {
    super.onCreate(saved);
    prefs = getSharedPreferences("allot", MODE_PRIVATE);
    if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
    web = new WebView(this) {
      @Override public boolean performHapticFeedback(int feedbackConstant, int flags) {
        // The UI confirms a completed long press when its drawer starts opening.
        // System long-press timing can fire earlier than the JavaScript gesture.
        if (feedbackConstant == HapticFeedbackConstants.LONG_PRESS) return false;
        return super.performHapticFeedback(feedbackConstant, flags);
      }
    };
    web.setBackgroundColor(Color.rgb(16,16,16));
    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setAllowFileAccess(false);
    web.getSettings().setAllowContentAccess(true);
    web.addJavascriptInterface(new Bridge(), "AllotNative");
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (!HOST.equals(uri.getHost()) || !"https".equals(uri.getScheme())) return denied();
        try {
          String path = uri.getPath();
          if (path == null || path.equals("/")) path = "/index.html";
          if (path.contains("..") || path.contains("\\")) return denied();
          String mime = path.endsWith(".html") ? "text/html" : path.endsWith(".css") ? "text/css" : (path.endsWith(".mjs") || path.endsWith(".js")) ? "text/javascript" : "application/octet-stream";
          return new WebResourceResponse(mime, "UTF-8", getAssets().open(path.substring(1)));
        } catch (Exception error) { return denied(); }
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !HOST.equals(request.getUrl().getHost()); }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = callback;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try { startActivityForResult(intent, 71); } catch (Exception error) { fileCallback.onReceiveValue(null); fileCallback = null; }
        return true;
      }
    });
    setContentView(web);
    web.loadUrl("https://" + HOST + "/index.html");
  }
  private WebResourceResponse denied() { return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0])); }
  @Override protected void onActivityResult(int code, int result, Intent data) {
    super.onActivityResult(code, result, data);
    if (code == 71 && fileCallback != null) {
      Uri[] uris = null;
      if (result == RESULT_OK && data != null) {
        if (data.getClipData() != null) { int count = data.getClipData().getItemCount(); uris = new Uri[count]; for (int i = 0; i < count; i++) uris[i] = data.getClipData().getItemAt(i).getUri(); }
        else if (data.getData() != null) uris = new Uri[]{data.getData()};
      }
      fileCallback.onReceiveValue(uris); fileCallback = null;
    }
  }
  @Override public void onBackPressed() { web.evaluateJavascript("window.allotBack && window.allotBack()", result -> { if ("false".equals(result)) finish(); }); }
  @Override protected void onDestroy() { executor.shutdownNow(); if (fileCallback != null) fileCallback.onReceiveValue(null); web.removeJavascriptInterface("AllotNative"); web.destroy(); super.onDestroy(); }
  private String error(String message) { try { return new JSONObject().put("error", message).toString(); } catch (Exception e) { return "{}"; } }
  private String base(String input) throws Exception {
    URL url = new URL(input);
    if (!url.getProtocol().equals("https") || url.getUserInfo() != null || url.getQuery() != null || url.getRef() != null) throw new Exception("API 地址须为 HTTPS");
    return input.replaceAll("/$", "");
  }
  public class Bridge {
    @JavascriptInterface public void lightHaptic() {
      runOnUiThread(() -> {
        if (!isFinishing() && !isDestroyed())
          web.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
      });
    }
    @JavascriptInterface public void copyText(final String id, final String text) {
      runOnUiThread(() -> {
        String result;
        try {
          ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
          if (clipboard == null) throw new Exception("无法访问剪贴板");
          clipboard.setPrimaryClip(ClipData.newPlainText("Allot 导出数据", text));
          result = "{\"data\":true}";
        } catch (Exception e) { result = error("复制失败，请重试"); }
        if (!isFinishing() && !isDestroyed()) web.evaluateJavascript("window.allotNativeResult(" + JSONObject.quote(id) + "," + result + ")", null);
      });
    }
    @JavascriptInterface public String clearData() { return prefs.edit().remove("state").commit() ? "{}" : error("清空失败，请重试"); }
    @JavascriptInterface public String clearApiKey() { return prefs.edit().remove("key").commit() ? "{}" : error("清除密钥失败，请重试"); }
    @JavascriptInterface public String saveApiKey(String input) {
      String key = input.trim();
      if (key.isEmpty() || key.length() > 500) return error("请填写有效的 API Key");
      return prefs.edit().putString("key", key).commit() ? "{}" : error("密钥保存失败");
    }
    @JavascriptInterface public String loadState() { return prefs.getString("state", ""); }
    @JavascriptInterface public String saveState(String data) {
      if (data.length() > 10000000) return error("本地数据过大");
      return prefs.edit().putString("state", data).commit() ? "{}" : error("本地保存失败");
    }
    @JavascriptInterface public String getConfig() {
      try { return new JSONObject().put("baseUrl", prefs.getString("base", "https://api.deepseek.com")).put("model", prefs.getString("model", "deepseek-flash")).put("configured", !prefs.getString("key", "").isEmpty()).toString(); }
      catch (Exception e) { return error("读取配置失败"); }
    }
    @JavascriptInterface public String saveConfig(String data) {
      try {
        JSONObject config = new JSONObject(data);
        String apiBase = base(config.getString("baseUrl"));
        String model = config.getString("model").trim();
        String key = config.optString("apiKey", "").trim(); if (key.isEmpty()) key = prefs.getString("key", "");
        if (model.isEmpty() || model.length() > 100 || key.length() > 500) throw new Exception("请填写有效的模型和 API Key");
        if (!prefs.edit().putString("base", apiBase).putString("model", model).putString("key", key).commit()) throw new Exception("配置保存失败");
        return "{}";
      } catch (Exception e) { return error(e.getMessage()); }
    }
    @JavascriptInterface public void modelRequest(final String id, final String data) {
      executor.execute(() -> {
        HttpURLConnection connection = null;
        String result;
        try {
          String key = prefs.getString("key", ""); if (key.isEmpty()) throw new Exception("请先在 AI 设置中填写 API Key");
          if (data.length() > 24000000) throw new Exception("请求过大");
          String endpoint = base(prefs.getString("base", "https://api.deepseek.com")).replaceAll("/chat/completions$", "") + "/chat/completions";
          JSONObject payload = new JSONObject(data).put("model", prefs.getString("model", "deepseek-flash")).put("stream", false);
          connection = (HttpURLConnection) new URL(endpoint).openConnection();
          connection.setConnectTimeout(20000); connection.setReadTimeout(90000); connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setInstanceFollowRedirects(false);
          connection.setRequestProperty("Content-Type", "application/json"); connection.setRequestProperty("Authorization", "Bearer " + key);
          byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
          try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
          int status = connection.getResponseCode(); if (status < 200 || status >= 300) throw new Exception("模型请求失败（" + status + "），请检查模型、密钥或余额");
          ByteArrayOutputStream output = new ByteArrayOutputStream();
          try (InputStream input = connection.getInputStream()) { byte[] buffer = new byte[8192]; int count; while ((count = input.read(buffer)) != -1) { output.write(buffer, 0, count); if (output.size() > 24000000) throw new Exception("返回内容过大"); } }
          result = new JSONObject().put("data", new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8))).toString();
        } catch (Exception e) { result = error(e instanceof java.net.SocketTimeoutException ? "模型请求超时，请重试" : e.getMessage()); }
        finally { if (connection != null) connection.disconnect(); }
        final String response = result;
        runOnUiThread(() -> { if (!isFinishing() && !isDestroyed()) web.evaluateJavascript("window.allotNativeResult(" + JSONObject.quote(id) + "," + response + ")", null); });
      });
    }
  }
}
