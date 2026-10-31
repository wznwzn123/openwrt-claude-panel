package io.github.wznwzn123.routerpanel;

import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.text.InputType;
import android.widget.EditText;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
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

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.common.GlobalHistogramBinarizer;
import com.google.zxing.common.HybridBinarizer;

import java.io.InputStream;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;

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
    // 从相册选一张带二维码的图片（比如别的手机上面板二维码的截图）
    private final ActivityResultLauncher<String> imgPicker = registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
        if (uri != null) new Thread(() -> decodeQr(uri)).start();
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
        // 首页一直在下面显示着，网页窗口盖在上面、需要时拿开（来回隐藏首页会导致它重绘不全）
        root.addView(home, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(site, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        setupHome();
        setupSite();
        ContextCompat.registerReceiver(this, onDownload, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (site.getVisibility() == View.VISIBLE) {
                    if (site.canGoBack()) site.goBack(); else showHome();
                } else finish();
            }
        });
        applyBars();
        showHome();
        // 只在调试包里：自动化测试用 am start --es open 网址 / --ez scan true
        if (BuildConfig.DEBUG) {
            String o = getIntent().getStringExtra("open");
            if (o != null) openUrl(o);
            if (getIntent().getBooleanExtra("scan", false)) new Bridge().scan();
            // --es homejs 代码：首页加载好后执行（测弹窗、手动添加）
            String hj = getIntent().getStringExtra("homejs");
            if (hj != null) home.postDelayed(() -> js(home, hj), 2500);
            // --ez qrtest true：识别调试包里自带的二维码图片（assets/qr-test.png，内容是 https://example.com/panel/）
            if (getIntent().getBooleanExtra("qrtest", false)) home.postDelayed(() -> new Thread(() -> decodeQr(() -> getAssets().open("qr-test.png"))).start(), 2500);
        }
    }

    /* ---------- 深色模式：老版本系统 WebView 不认系统设置，由 App 自己告诉首页 ---------- */
    private boolean isDark() { return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES; }
    private void applyBars() {
        boolean d = isDark();
        int c = d ? Color.parseColor("#0B1024") : Color.parseColor("#EEF1F8");
        getWindow().setStatusBarColor(c);
        getWindow().setNavigationBarColor(c);
        getWindow().getDecorView().setBackgroundColor(c);
        if (site != null) site.setBackgroundColor(c);  // 网页还没加载出来时的底色，深色时不闪白
        View dv = getWindow().getDecorView();
        int f = dv.getSystemUiVisibility();
        f = d ? (f & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) : (f | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        if (Build.VERSION.SDK_INT >= 26) f = d ? (f & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR) : (f | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        dv.setSystemUiVisibility(f);
    }
    // 切换深色/浅色时不重建页面（不然面板会重新加载），只更新颜色
    @Override public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        applyBars();
        if (home != null) js(home, "window.setDark && setDark(" + isDark() + ")");
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
        // 首页里的提示、确认、输入框：不设置这个的话，安卓会把它们全部悄悄吞掉（点了没反应）
        home.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsAlert(WebView v, String url, String msg, JsResult r) {
                new AlertDialog.Builder(MainActivity.this).setMessage(msg).setPositiveButton("知道了", (d, w) -> r.confirm())
                        .setOnCancelListener(d -> r.confirm()).show();
                return true;
            }
            @Override public boolean onJsConfirm(WebView v, String url, String msg, JsResult r) {
                new AlertDialog.Builder(MainActivity.this).setMessage(msg)
                        .setPositiveButton("确定", (d, w) -> r.confirm()).setNegativeButton("取消", (d, w) -> r.cancel())
                        .setOnCancelListener(d -> r.cancel()).show();
                return true;
            }
            @Override public boolean onJsPrompt(WebView v, String url, String msg, String def, JsPromptResult r) {
                EditText in = new EditText(MainActivity.this);
                in.setInputType(InputType.TYPE_CLASS_TEXT);
                in.setSingleLine(true);
                if (def != null) { in.setText(def); in.setSelection(def.length()); }
                int pad = (int) (20 * getResources().getDisplayMetrics().density);
                FrameLayout box = new FrameLayout(MainActivity.this);
                box.setPadding(pad, pad / 2, pad, 0);
                box.addView(in);
                new AlertDialog.Builder(MainActivity.this).setMessage(msg).setView(box)
                        .setPositiveButton("确定", (d, w) -> r.confirm(in.getText().toString())).setNegativeButton("取消", (d, w) -> r.cancel())
                        .setOnCancelListener(d -> r.cancel()).show();
                return true;
            }
        });
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
    private void showHome() { site.setVisibility(View.INVISIBLE); js(home, "window.refresh && refresh()"); }
    private void showSite() { site.setVisibility(View.VISIBLE); site.invalidate(); }
    // 识别图片里的二维码：大图先缩小，再用两种方式各试一次
    private interface Src { InputStream open() throws Exception; }
    private void decodeQr(Uri uri) { decodeQr(() -> getContentResolver().openInputStream(uri)); }
    private void decodeQr(Src open) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            try (InputStream in = open.open()) { BitmapFactory.decodeStream(in, null, o); }
            int side = Math.max(o.outWidth, o.outHeight), ss = 1;
            while (side / ss > 2000) ss *= 2;
            BitmapFactory.Options o2 = new BitmapFactory.Options();
            o2.inSampleSize = ss;
            Bitmap b;
            try (InputStream in = open.open()) { b = BitmapFactory.decodeStream(in, null, o2); }
            if (b == null) throw new Exception("not image");
            int w = b.getWidth(), h = b.getHeight();
            int[] px = new int[w * h];
            b.getPixels(px, 0, w, 0, 0, w, h);
            b.recycle();
            RGBLuminanceSource src = new RGBLuminanceSource(w, h, px);
            Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
            hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
            hints.put(DecodeHintType.POSSIBLE_FORMATS, EnumSet.of(BarcodeFormat.QR_CODE));
            String text;
            try { text = new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(src)), hints).getText(); }
            catch (Exception e) { text = new MultiFormatReader().decode(new BinaryBitmap(new GlobalHistogramBinarizer(src)), hints).getText(); }
            js(home, "onScan(" + JSONObject.quote(text) + ")");
        } catch (Exception e) {
            android.util.Log.w("RouterPanel", "识别二维码失败", e);
            toast("这张图片里没找到二维码。请用清楚一点的截图（面板里的二维码要先点一下，去掉模糊再截图）");
        }
    }
    private void js(WebView w, String code) { runOnUiThread(() -> w.evaluateJavascript(code, null)); }
    private void toast(String t) { runOnUiThread(() -> Toast.makeText(this, t, Toast.LENGTH_SHORT).show()); }

    /** 只给 App 首页用的接口 */
    private class Bridge {
        @JavascriptInterface public String version() { return BuildConfig.VERSION_NAME; }
        @JavascriptInterface public boolean dark() { return isDark(); }
        @JavascriptInterface public String hub() { return BuildConfig.HUB_URL; }
        @JavascriptInterface public String routers() { return MainActivity.this.routers().toString(); }
        @JavascriptInterface public void saveRouters(String json) { try { save(new JSONArray(json)); } catch (Exception e) {} }
        @JavascriptInterface public void open(String url) { runOnUiThread(() -> openUrl(url)); }
        @JavascriptInterface public void external(String url) { runOnUiThread(() -> MainActivity.this.external(url)); }
        // 读手机剪贴板（网页自己读剪贴板在 App 里经常被拦，改用系统的）
        @JavascriptInterface public String clipboard() {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                ClipData c = cm == null ? null : cm.getPrimaryClip();
                if (c == null || c.getItemCount() == 0) return "";
                CharSequence t = c.getItemAt(0).coerceToText(MainActivity.this);
                return t == null ? "" : t.toString();
            } catch (Exception e) { return ""; }
        }
        @JavascriptInterface public void pickQr() { runOnUiThread(() -> { try { imgPicker.launch("image/*"); } catch (Exception e) { toast("打不开相册"); } }); }
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
