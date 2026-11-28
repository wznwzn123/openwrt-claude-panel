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
import android.webkit.WebResourceResponse;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.RouteInfo;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONTokener;

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
    private FrameLayout root;
    // 状态栏：App 画到状态栏下面（状态栏透明）。面板页面声明了支持（RP_EDGE）就让背景一直铺到顶上；
    // 别的页面往下让开状态栏的高度，状态栏那一条涂成页面给的颜色（meta theme-color）
    private int sbh = 0;                 // 状态栏高度（像素）
    private boolean edge = false;        // 现在显示的网页支持铺到状态栏下面
    private int barColor = 0;            // 网页给的顶部颜色（0 = 没给）
    private final Handler ui = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private ValueCallback<Uri[]> fileCb;
    private long apkId = -1;
    // 从桌面图标正常打开（不是带着网址、调试参数打开的）：首页只有一台路由器时直接进它的面板（用户 11/28 定）
    private boolean plain = false;

    private final ActivityResultLauncher<ScanOptions> scanner = registerForActivityResult(new ScanContract(), r -> {
        if (r.getContents() != null) js(home, "onScan(" + JSONObject.quote(r.getContents()) + ")");
    });
    // 从相册选一张带二维码的图片（比如别的手机上面板二维码的截图）
    private final ActivityResultLauncher<String> imgPicker = registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
        if (uri != null) new Thread(() -> decodeQr(uri)).start();
    });
    private final ActivityResultLauncher<Intent> picker = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), r -> {
        if (fileCb == null) return;
        Uri[] res = WebChromeClient.FileChooserParams.parseResult(r.getResultCode(), r.getData());
        // 多选（或者有的相册只选一张也按多选返回）：图片在 ClipData 里，parseResult 读不到，要自己取出来
        Intent d = r.getData();
        if (r.getResultCode() == RESULT_OK && d != null && d.getClipData() != null && d.getClipData().getItemCount() > 0) {
            android.content.ClipData c = d.getClipData();
            res = new Uri[c.getItemCount()];
            for (int i = 0; i < c.getItemCount(); i++) res[i] = c.getItemAt(i).getUri();
        }
        fileCb.onReceiveValue(res);
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
        Intent li = getIntent();
        plain = saved == null && li != null && Intent.ACTION_MAIN.equals(li.getAction()) && li.getData() == null
                && !li.hasExtra("open") && !li.hasExtra("homejs") && !li.hasExtra("sitejs") && !li.hasExtra("scan") && !li.hasExtra("qrtest");
        root = new FrameLayout(this);
        home = new WebView(this);
        site = new WebView(this);
        // 首页一直在下面显示着，网页窗口盖在上面、需要时拿开（来回隐藏首页会导致它重绘不全）
        root.addView(home, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(site, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        // 内容画到状态栏下面，状态栏本身透明；状态栏多高由系统告诉我们
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, ins) -> { sbh = ins.getInsets(WindowInsetsCompat.Type.statusBars()).top; layoutBars(); return ins; });
        setupHome();
        setupSite();
        ContextCompat.registerReceiver(this, onDownload, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                // 网页（面板、官网）：交给网页自己的返回（先关弹窗、回上一页，6.0 第 68 项），退到头了回 App 首页
                if (site.getVisibility() == View.VISIBLE) {
                    if (site.canGoBack()) site.goBack(); else showHome();
                } else home.evaluateJavascript("window.appBack ? appBack() : false", r -> { if (!"true".equals(r)) finish(); }); // 首页：先关更新提示，再退出
            }
        });
        applyBars();
        showHome();
        ui.post(barPoll);
        // 只在调试包里：自动化测试用 am start --es open 网址 / --ez scan true
        if (BuildConfig.DEBUG) {
            String o = getIntent().getStringExtra("open");
            if (o != null) openUrl(o);
            if (getIntent().getBooleanExtra("scan", false)) new Bridge().scan();
            // --es homejs 代码：首页加载好后执行（测弹窗、手动添加）
            String hj = getIntent().getStringExtra("homejs");
            if (hj != null) home.postDelayed(() -> js(home, hj), 2500);
            // --es sitejs 代码：网页窗口加载好后执行（测状态栏：模拟一个铺到顶上的面板页面）
            String sj = getIntent().getStringExtra("sitejs");
            if (sj != null) site.postDelayed(() -> site.evaluateJavascript(sj, null), 6000);
            // --ez qrtest true：识别调试包里自带的二维码图片（assets/qr-test.png，内容是 https://example.com/panel/）
            if (getIntent().getBooleanExtra("qrtest", false)) home.postDelayed(() -> new Thread(() -> decodeQr(() -> getAssets().open("qr-test.png"))).start(), 2500);
        }
    }

    /* 6.0 第 71 项：浏览器里确认 App 登录后点「回到 App」（routerpanel://auth）：让账号页马上去取登录，不用等下一次 */
    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        Uri d = i.getData();
        if (d != null && "routerpanel".equals(d.getScheme()) && "auth".equals(d.getHost()) && site != null)
            site.evaluateJavascript("window.appPollNow && appPollNow()", null);
    }

    /* ---------- 深色模式：老版本系统 WebView 不认系统设置，由 App 自己告诉首页 ---------- */
    private boolean isDark() { return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES; }
    private void applyBars() {
        boolean d = isDark();
        int c = d ? Color.parseColor("#0B0C0F") : Color.parseColor("#ECEEF2");
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(c);
        getWindow().getDecorView().setBackgroundColor(c);
        if (site != null) site.setBackgroundColor(c);  // 网页还没加载出来时的底色，深色时不闪白
        View dv = getWindow().getDecorView();
        int f = dv.getSystemUiVisibility();
        f = d ? (f & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) : (f | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        if (Build.VERSION.SDK_INT >= 26) f = d ? (f & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR) : (f | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        dv.setSystemUiVisibility(f);
        layoutBars();
    }
    // 状态栏那一条：首页 → 首页的底色；网页 → 网页给的颜色（支持铺到顶上的面板，背景本身就在状态栏下面）
    // 图标颜色跟着底色：浅底黑字、深底白字
    private void layoutBars() {
        if (root == null || home == null || site == null) return;
        boolean onSite = site.getVisibility() == View.VISIBLE;
        int def = isDark() ? Color.parseColor("#0B0C0F") : Color.parseColor("#ECEEF2");
        int c = onSite && barColor != 0 ? barColor : def;
        root.setBackgroundColor(c);
        setTop(home, sbh);
        setTop(site, onSite && edge ? 0 : sbh);
        double lum = (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)) / 255;
        View dv = getWindow().getDecorView();
        int f = dv.getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;
        f = lum > 0.6 ? (f | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) : (f & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        if (f != dv.getSystemUiVisibility()) dv.setSystemUiVisibility(f);
    }
    private void setTop(View v, int top) {
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) v.getLayoutParams();
        if (lp != null && lp.topMargin != top) { lp.topMargin = top; v.setLayoutParams(lp); }
    }
    // 每 0.7 秒看一次网页：顶部颜色、支不支持铺到状态栏下面；支持的话告诉它状态栏多高（CSS 变量 --sat）
    private static final String BAR_JS = "(function(){try{var m=[].slice.call(document.querySelectorAll('meta[name=theme-color]')).filter(function(x){return !x.media||matchMedia(x.media).matches});return JSON.stringify({c:m.length?m[m.length-1].getAttribute('content'):'',e:!!window.RP_EDGE})}catch(e){return ''}})()";
    private final Runnable barPoll = new Runnable() {
        @Override public void run() { pollBar(); ui.postDelayed(this, 700); }
    };
    private void pollBar() {
            if (site != null && site.getVisibility() == View.VISIBLE) {
                site.evaluateJavascript(BAR_JS, v -> {
                    try {
                        Object o = new JSONTokener(v).nextValue();
                        if (!(o instanceof String) || ((String) o).isEmpty()) return;
                        JSONObject j = new JSONObject((String) o);
                        boolean e = j.optBoolean("e");
                        int c = 0; String cs = j.optString("c");
                        if (cs.matches("#[0-9a-fA-F]{6}")) c = Color.parseColor(cs);
                        if (e) site.evaluateJavascript("document.documentElement.style.setProperty('--sat','" + Math.round(sbh / getResources().getDisplayMetrics().density) + "px')", null);
                        if (e != edge || c != barColor) { edge = e; barColor = c; layoutBars(); }
                    } catch (Exception ex) {}
                });
            }
    }
    // 切换深色/浅色时不重建页面（不然面板会重新加载），只更新颜色
    @Override public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        applyBars();
        if (home != null) js(home, "window.setDark && setDark(" + isDark() + ")");
    }

    @Override protected void onDestroy() { ui.removeCallbacks(barPoll); try { unregisterReceiver(onDownload); } catch (Exception e) {} super.onDestroy(); }

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
                // 面板「桌面小组件」：只认面板自己的网址跳过来的；面板侧边栏「切换路由器」（App 6.0.2 起）：回 App 首页
                if ("routerpanel".equals(u.getScheme())) { if ("widget".equals(u.getHost())) addWidget(u); else if ("home".equals(u.getHost())) showHome(); return true; }
                // 确认 App 登录：在 App 里弹出的浏览器页（Custom Tabs，用手机 Chrome 的官网登录状态），点「允许」后跳 routerpanel://auth 回来
                String hub = hubHost();
                if (hub != null && hub.equals(u.getHost()) && "/app".equals(u.getPath()) && u.getQueryParameter("ok") != null) { authTab(u.toString()); return true; }
                if ("https".equals(u.getScheme()) && allowed(u.getHost())) return false;
                // 本地版：家里局域网的面板（http://路由器地址:906）
                if ("http".equals(u.getScheme()) && SpeedWidget.lanHost(u.getHost())) return false;
                external(u.toString());
                return true;
            }
            // http 只给家里局域网的地址（系统层面放开了 http，这里管住）
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("http".equals(u.getScheme()) && !SpeedWidget.lanHost(u.getHost())) return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", null, new ByteArrayInputStream(new byte[0]));
                return null;
            }
            // 家里的地址（本地版、局域网）在外面打不开：不显示系统的报错页，回首页说清楚怎么办（用户 11/28 17:32：用 App 的人不知道怎么换成 AI 版）
            @Override public void onReceivedError(WebView v, WebResourceRequest r, android.webkit.WebResourceError e) {
                Uri u = r.getUrl();
                if (!r.isForMainFrame() || !"http".equals(u.getScheme()) || !SpeedWidget.lanHost(u.getHost())) return;
                v.stopLoading();
                showHome();
                js(home, "window.lanFail && lanFail(" + JSONObject.quote(u.getScheme() + "://" + u.getAuthority() + "/panel/") + ")");
            }
            // 托管版换成本地版以后，专属网址回 Cloudflare 522（面板没缓存时就是一张报错页）：同样回首页说清楚
            @Override public void onReceivedHttpError(WebView v, WebResourceRequest r, WebResourceResponse e) {
                Uri u = r.getUrl();
                // 面板有缓存时页面本身能打开，是接口回 522（用户 11/28 18:31「还是这样」）：也算，一次加载只提示一次
                if (e.getStatusCode() != 522 || !"https".equals(u.getScheme()) || !allowed(u.getHost())) return;
                Uri cur = v.getUrl() == null ? null : Uri.parse(v.getUrl());
                if (!r.isForMainFrame() && (cur == null || !u.getHost().equals(cur.getHost()))) return;
                if (local522) return;
                local522 = true;
                v.stopLoading();
                showHome();
                js(home, "window.lanFail && lanFail(" + JSONObject.quote("https://" + u.getAuthority() + "/panel/") + ")");
            }
            @Override public void onPageFinished(WebView v, String url) { remember(url); pollBar(); }
            @Override public void onPageStarted(WebView v, String url, Bitmap fav) { local522 = false; if (edge) { edge = false; barColor = 0; layoutBars(); } }
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
        boolean lan = "http".equals(u.getScheme()) && SpeedWidget.lanHost(u.getHost());
        if ((!"https".equals(u.getScheme()) && !lan) || u.getPath() == null || !u.getPath().startsWith("/panel")) return;
        String key = u.getScheme() + "://" + u.getAuthority() + "/panel/";
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
        boolean lan = "http".equals(u.getScheme()) && SpeedWidget.lanHost(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/panel");
        if (lan || ("https".equals(u.getScheme()) && (allowed(u.getHost()) || (u.getPath() != null && u.getPath().startsWith("/panel"))))) {
            showSite();
            site.loadUrl(url);
        } else external(url);
    }
    // 6.0.2：官网确认页在 App 里弹出（Custom Tabs）。顶部颜色跟首页一样；手机上没有支持的浏览器时交给系统浏览器
    private void authTab(String url) {
        try {
            CustomTabsIntent t = new CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .setColorScheme(CustomTabsIntent.COLOR_SCHEME_SYSTEM)
                    .setColorSchemeParams(CustomTabsIntent.COLOR_SCHEME_LIGHT, new CustomTabColorSchemeParams.Builder().setToolbarColor(Color.parseColor("#ECEEF2")).setNavigationBarColor(Color.parseColor("#ECEEF2")).build())
                    .setColorSchemeParams(CustomTabsIntent.COLOR_SCHEME_DARK, new CustomTabColorSchemeParams.Builder().setToolbarColor(Color.parseColor("#0B0C0F")).setNavigationBarColor(Color.parseColor("#0B0C0F")).build())
                    .build();
            t.launchUrl(this, Uri.parse(url));
        } catch (Exception e) { external(url); }
    }
    private void external(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception e) { toast("没有可以打开这个链接的应用"); }
    }
    // 用 INVISIBLE 不用 GONE：隐藏时网页照常排版，切回来不会空白
    private void showHome() { site.setVisibility(View.INVISIBLE); layoutBars(); js(home, "window.refresh && refresh()"); }
    private void showSite() { site.setVisibility(View.VISIBLE); site.invalidate(); layoutBars(); }
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
    /* 6.0 第 38 项：面板发来小组件钥匙（routerpanel://widget?k=编号.密钥&n=路由器名字）。
       只认现在打开着的是面板自己的网址（托管、自建的 https，或者家里局域网的 http），数据地址就用这个网址 */
    private void addWidget(Uri u) {
        String cur = site.getUrl(), k = u.getQueryParameter("k"), n = u.getQueryParameter("n");
        Uri c = cur == null ? null : Uri.parse(cur);
        boolean ok = c != null && c.getPath() != null && c.getPath().startsWith("/panel")
                && (("https".equals(c.getScheme()) && allowed(c.getHost())) || ("http".equals(c.getScheme()) && SpeedWidget.lanHost(c.getHost())));
        if (!ok || k == null || !k.matches("[a-z0-9]{8}\\.[a-z0-9]{32}")) { toast("小组件没加上，在面板里再点一次"); return; }
        SpeedWidget.prefs(this).edit().putString("url", c.getScheme() + "://" + c.getAuthority() + "/cgi-bin/mcp/widget").putString("k", k)
                .putString("name", n == null ? "" : n.substring(0, Math.min(40, n.length()))).remove("last").apply();
        SpeedWidget.update(this);
        AppWidgetManager m = AppWidgetManager.getInstance(this);
        int have = m.getAppWidgetIds(new ComponentName(this, SpeedWidget.class)).length;
        if (have > 0) { toast("桌面小组件已更新"); return; }
        if (Build.VERSION.SDK_INT >= 26 && m.isRequestPinAppWidgetSupported()) {
            // 小米 HyperOS 等：没开「桌面快捷方式」权限时系统直接不理这个请求，也不报错。添加框弹出来会抢走窗口焦点；0.8 秒内没抢走、桌面上也没有小组件，就告诉用户怎么办
            // 小米能直接查到「桌面快捷方式」没开：马上告诉用户，不用等（用户 11/28 16:38「弹出太慢了」）
            if (xiaomi() && miShortcutDenied()) { widgetHelp(); return; }
            pinShown = false;
            try { m.requestPinAppWidget(new ComponentName(this, SpeedWidget.class), null, null); } catch (Exception e) { widgetHelp(); return; }
            ui.postDelayed(() -> { if (!pinShown && m.getAppWidgetIds(new ComponentName(this, SpeedWidget.class)).length == 0) widgetHelp(); }, 800);
        } else widgetHelp();
    }
    private boolean pinShown = true;
    private boolean local522 = false; // 这次打开的面板已经因为 522（本地版）回过首页了
    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (!f) pinShown = true; }
    private boolean xiaomi() { return "xiaomi".equalsIgnoreCase(Build.MANUFACTURER) || "redmi".equalsIgnoreCase(Build.BRAND) || "poco".equalsIgnoreCase(Build.BRAND); }
    /* 小米的「桌面快捷方式」权限是自己加的 AppOps（10017），官方接口查不到，只能反射问；查不到就当没关，走上面等 0.8 秒的办法 */
    private boolean miShortcutDenied() {
        try {
            android.app.AppOpsManager o = (android.app.AppOpsManager) getSystemService(APP_OPS_SERVICE);
            java.lang.reflect.Method c = android.app.AppOpsManager.class.getMethod("checkOpNoThrow", int.class, int.class, String.class);
            int r = (Integer) c.invoke(o, 10017, android.os.Process.myUid(), getPackageName());
            return r == android.app.AppOpsManager.MODE_IGNORED || r == android.app.AppOpsManager.MODE_ERRORED;
        } catch (Throwable e) { return false; }
    }
    private void widgetHelp() {
        if (isFinishing()) return;
        String m = xiaomi() ? "要先打开「桌面快捷方式」权限，再回面板点「添加」。\n或者长按桌面空白处 →「小部件」→「路由器面板」。"
                : "长按桌面空白处 →「小组件」→「路由器面板」。";
        AlertDialog.Builder b = new AlertDialog.Builder(this).setTitle("没弹出添加框").setMessage(m).setNegativeButton("知道了", null);
        if (xiaomi()) b.setPositiveButton("去开权限", (d, w) -> openPerm());
        b.show();
    }
    private void openPerm() {
        Intent mi = new Intent("miui.intent.action.APP_PERM_EDITOR").putExtra("extra_pkgname", getPackageName());
        try { startActivity(mi); return; } catch (Exception e) {}
        try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); } catch (Exception e) { toast("没打开设置页，去 设置 → 应用 → 路由器面板 里找"); }
    }

    /* 6.0 第 40 项：在家里 Wi-Fi 下找路由器面板：问一下网关（路由器）的 906 端口（装的时候被占用会换 9906、19906）。
       只发现，不自动登录；找到了在首页列出来，点了打开登录页 */
    private void discover() {
        new Thread(() -> {
            JSONArray out = new JSONArray();
            try {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
                Network n = cm == null ? null : cm.getActiveNetwork();
                LinkProperties lp = n == null ? null : cm.getLinkProperties(n);
                if (lp != null) for (RouteInfo r : lp.getRoutes()) {
                    InetAddress g = r.getGateway();
                    if (!r.isDefaultRoute() || !(g instanceof Inet4Address)) continue;
                    String ip = g.getHostAddress();
                    if (!SpeedWidget.lanHost(ip)) continue;
                    for (int port : new int[] { 906, 9906, 19906 }) if (probe(ip, port)) { out.put(new JSONObject().put("ip", ip).put("url", "http://" + ip + ":" + port + "/panel/")); break; }
                }
            } catch (Exception e) {}
            js(home, "window.onFound && onFound(" + out + ")");
        }).start();
    }
    // 不走 http 库（不用放开整个 App 的 http）：直接连端口要首页，看是不是路由器面板
    private static boolean probe(String ip, int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(ip, port), 1500);
            s.setSoTimeout(2500);
            OutputStream o = s.getOutputStream();
            o.write(("GET /panel/ HTTP/1.0\r\nHost: " + ip + ":" + port + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            o.flush();
            InputStream in = s.getInputStream();
            byte[] buf = new byte[65536]; int len = 0, n;
            while (len < buf.length && (n = in.read(buf, len, buf.length - len)) > 0) len += n;
            String t = new String(buf, 0, len, StandardCharsets.UTF_8);
            return t.startsWith("HTTP/1.") && t.contains("RP_EDGE");
        } catch (Exception e) { return false; }
    }

    private void js(WebView w, String code) { runOnUiThread(() -> w.evaluateJavascript(code, null)); }
    private void toast(String t) { runOnUiThread(() -> Toast.makeText(this, t, Toast.LENGTH_SHORT).show()); }

    /** 只给 App 首页用的接口 */
    private class Bridge {
        @JavascriptInterface public String version() { return BuildConfig.VERSION_NAME; }
        @JavascriptInterface public boolean dark() { return isDark(); }
        // 首页问：这次是不是从桌面图标正常打开的（只问一次，问完就不算了：返回首页再刷新不会又自动进面板）
        @JavascriptInterface public boolean plainLaunch() { boolean p = plain; plain = false; return p; }
        @JavascriptInterface public String hub() { return BuildConfig.HUB_URL; }
        @JavascriptInterface public String routers() { return MainActivity.this.routers().toString(); }
        @JavascriptInterface public void saveRouters(String json) { try { save(new JSONArray(json)); } catch (Exception e) {} }
        @JavascriptInterface public void open(String url) { runOnUiThread(() -> openUrl(url)); }
        @JavascriptInterface public void external(String url) { runOnUiThread(() -> MainActivity.this.external(url)); }
        @JavascriptInterface public void discover() { MainActivity.this.discover(); }
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
