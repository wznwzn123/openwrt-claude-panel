package io.github.wznwzn123.routerpanel;

import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanOptions;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 两个 WebView：
 * - home：App 自己的首页（assets/home.html），有 App 接口（扫码、保存路由器列表、检查更新）
 * - site：打开路由器面板和官网，没有任何 App 接口（远程网页碰不到手机功能）
 * 路由器的登录密钥只存在 site 里那个网址自己的本地存储中，App 不读取、不保存。
 */
public class MainActivity extends AppCompatActivity {
    private WebView home, site;
    private SharedPreferences prefs;
    private ValueCallback<Uri[]> fileCb;
    private long apkId = -1;

    private final ActivityResultLauncher<ScanOptions> scanner = registerForActivityResult(new ScanContract(), r -> {
        if (r.getContents() != null) js(home, "onScan(" + JSONObject.quote(r.getContents()) + ")");
    });
    private final ActivityResultLauncher<Intent> picker = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), r -> {
        if (fileCb == null) return;
        fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.getResultCode(), r.getData()));
        fileCb = null;
    });

    // 更新包下载完成后打开安装界面
    private final BroadcastReceiver onDownload = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            long id = i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (id != apkId || apkId < 0) return;
            apkId = -1;
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            Uri uri = dm.getUriForDownloadedFile(id);
            if (uri == null) { toast("更新包下载失败，稍后再试"); js(home, "onUpdateFail()"); return; }
            Intent in = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            try { startActivity(in); } catch (Exception e) { toast("打不开安装界面：" + e.getMessage()); }
            js(home, "onUpdateFail()");
        }
    };

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs = getSharedPreferences("app", MODE_PRIVATE);
        FrameLayout root = new FrameLayout(this);
        home = new WebView(this);
        site = new WebView(this);
        root.addView(site, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(home, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        setupHome();
        setupSite();
        ContextCompat.registerReceiver(this, onDownload, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (site.getVisibility() == View.VISIBLE && home.getVisibility() != View.VISIBLE) {
                    if (site.canGoBack()) site.goBack(); else showHome();
                } else finish();
            }
        });
        showHome();
        // 只在调试包里：自动化测试用 am start --es open 网址 / --ez scan true
        if (BuildConfig.DEBUG) {
            String o = getIntent().getStringExtra("open");
            if (o != null) openUrl(o);
            if (getIntent().getBooleanExtra("scan", false)) new Bridge().scan();
        }
    }

    @Override protected void onDestroy() { try { unregisterReceiver(onDownload); } catch (Exception e) {} super.onDestroy(); }

    /* ---------- App 首页 ---------- */
    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void setupHome() {
        WebSettings s = home.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        home.addJavascriptInterface(new Bridge(), "App");
        home.setWebViewClient(new WebViewClient() {
            // 首页只显示自己；点了别的链接就交给面板窗口或系统浏览器
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String u = r.getUrl().toString();
                if (u.startsWith("file:///android_asset/")) return false;
                openUrl(u);
                return true;
            }
        });
        home.loadUrl("file:///android_asset/home.html");
    }

    /* ---------- 面板和官网 ---------- */
    @SuppressLint("SetJavaScriptEnabled")
    private void setupSite() {
        WebSettings s = site.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " RouterPanelApp/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        site.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("https".equals(u.getScheme()) && allowed(u.getHost())) return false;
                external(u.toString());
                return true;
            }
            @Override public void onPageFinished(WebView v, String url) { remember(url); }
        });
        site.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try { picker.launch(p.createIntent()); } catch (Exception e) { fileCb = null; toast("打不开文件选择"); return false; }
                return true;
            }
        });
        // 面板里下载备份、导出文件
        site.setDownloadListener((url, ua, cd, mime, len) -> {
            if (!URLUtil.isHttpsUrl(url)) { toast("这个文件不能直接下载"); return; }
            try {
                String name = URLUtil.guessFileName(url, cd, mime);
                DownloadManager.Request q = new DownloadManager.Request(Uri.parse(url));
                String ck = CookieManager.getInstance().getCookie(url);
                if (ck != null) q.addRequestHeader("Cookie", ck);
                q.addRequestHeader("User-Agent", ua);
                q.setTitle(name);
                q.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                q.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(q);
                toast("开始下载：" + name);
            } catch (Exception e) { toast("下载失败：" + e.getMessage()); }
        });
    }

    // 只在 App 里打开：托管服务的网址（含各路由器子域名）、已保存的路由器；其他网址交给系统浏览器
    private boolean allowed(String host) {
        if (host == null) return false;
        String hub = hubHost();
        if (hub != null && (host.equals(hub) || host.endsWith("." + hub))) return true;
        try {
            JSONArray a = routers();
            for (int i = 0; i < a.length(); i++) if (host.equals(Uri.parse(a.getJSONObject(i).getString("url")).getHost())) return true;
        } catch (Exception e) {}
        return false;
    }
    private String hubHost() { String h = BuildConfig.HUB_URL; return h == null || h.isEmpty() ? null : Uri.parse(h).getHost(); }

    // 打开过的路由器面板记到首页列表里（只记网址，不记密钥）
    private void remember(String url) {
        Uri u = Uri.parse(url);
        if (!"https".equals(u.getScheme()) || u.getPath() == null || !u.getPath().startsWith("/panel")) return;
        String key = "https://" + u.getAuthority() + "/panel/";
        try {
            JSONArray a = routers();
            for (int i = 0; i < a.length(); i++) if (key.equals(a.getJSONObject(i).getString("url"))) { a.getJSONObject(i).put("at", System.currentTimeMillis()); save(a); return; }
            a.put(new JSONObject().put("url", key).put("name", u.getHost()).put("at", System.currentTimeMillis()));
            save(a);
        } catch (Exception e) {}
    }
    private JSONArray routers() { try { return new JSONArray(prefs.getString("routers", "[]")); } catch (Exception e) { return new JSONArray(); } }
    private void save(JSONArray a) { prefs.edit().putString("routers", a.toString()).apply(); }

    private void openUrl(String url) {
        Uri u = Uri.parse(url);
        if ("https".equals(u.getScheme()) && (allowed(u.getHost()) || (u.getPath() != null && u.getPath().startsWith("/panel")))) {
            showSite();
            site.loadUrl(url);
        } else external(url);
    }
    private void external(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception e) { toast("没有可以打开这个链接的应用"); }
    }
    // 用 INVISIBLE 不用 GONE：隐藏时网页照常排版，切回来不会空白
    private void showHome() { home.setVisibility(View.VISIBLE); site.setVisibility(View.INVISIBLE); home.bringToFront(); home.invalidate(); js(home, "window.refresh && refresh()"); }
    private void showSite() { site.setVisibility(View.VISIBLE); home.setVisibility(View.INVISIBLE); site.bringToFront(); }
    private void js(WebView w, String code) { runOnUiThread(() -> w.evaluateJavascript(code, null)); }
    private void toast(String t) { runOnUiThread(() -> Toast.makeText(this, t, Toast.LENGTH_SHORT).show()); }

    /** 只给 App 首页用的接口 */
    private class Bridge {
        @JavascriptInterface public String version() { return BuildConfig.VERSION_NAME; }
        @JavascriptInterface public String hub() { return BuildConfig.HUB_URL; }
        @JavascriptInterface public String routers() { return MainActivity.this.routers().toString(); }
        @JavascriptInterface public void saveRouters(String json) { try { save(new JSONArray(json)); } catch (Exception e) {} }
        @JavascriptInterface public void open(String url) { runOnUiThread(() -> openUrl(url)); }
        @JavascriptInterface public void external(String url) { runOnUiThread(() -> MainActivity.this.external(url)); }
        @JavascriptInterface public void scan() {
            runOnUiThread(() -> {
                ScanOptions o = new ScanOptions();
                o.setDesiredBarcodeFormats(ScanOptions.QR_CODE);
                o.setPrompt("对准路由器面板里的二维码");
                o.setBeepEnabled(false);
                o.setOrientationLocked(false);
                scanner.launch(o);
            });
        }
        // 下载更新包（走托管服务的域名，大陆也能下），下载完自动打开安装界面
        @JavascriptInterface public void update(String url) {
            runOnUiThread(() -> {
                if (!URLUtil.isHttpsUrl(url) || !allowed(Uri.parse(url).getHost())) { toast("更新地址不对"); return; }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
                    toast("请先允许「路由器面板」安装应用，然后回来再点一次更新");
                    try { startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); } catch (Exception e) {}
                    js(home, "onUpdateFail()");
                    return;
                }
                try {
                    DownloadManager.Request q = new DownloadManager.Request(Uri.parse(url));
                    q.setTitle("路由器面板更新");
                    q.setMimeType("application/vnd.android.package-archive");
                    q.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
                    java.io.File old = new java.io.File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "router-panel-update.apk");
                    if (old.exists()) old.delete();
                    q.setDestinationInExternalFilesDir(MainActivity.this, Environment.DIRECTORY_DOWNLOADS, "router-panel-update.apk");
                    apkId = ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(q);
                    toast("正在下载更新…");
                } catch (Exception e) { toast("下载失败：" + e.getMessage()); js(home, "onUpdateFail()"); }
            });
        }
    }
}
