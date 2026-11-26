package io.github.wznwzn123.routerpanel;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 6.0 第 38 项：桌面小组件——网速、在线设备数。
 * 钥匙是路由器发的「小组件钥匙」，只能拿这几样数据（在面板「登录着的设备」里能移除）；存在 App 自己的设置里，网页碰不到。
 * 系统最快 30 分钟更新一次；点小组件立刻刷新。
 */
public class SpeedWidget extends AppWidgetProvider {
    static final String ACT = "io.github.wznwzn123.routerpanel.WIDGET_REFRESH";

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("widget", Context.MODE_PRIVATE); }

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { refresh(c, goAsync()); }

    @Override public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        if (ACT.equals(i.getAction())) refresh(c, goAsync());
    }

    /** App 里加好钥匙后调一次 */
    static void update(Context c) { refresh(c.getApplicationContext(), null); }

    private static void refresh(Context c, PendingResult pr) {
        new Thread(() -> {
            try { draw(c, fetch(c)); } catch (Exception e) { /* 画不出来就等下一次 */ }
            finally { if (pr != null) pr.finish(); }
        }).start();
    }

    /** 只让家里局域网的私有地址走 http（本地版），别的只走 https */
    static boolean lanHost(String h) {
        if (h == null || !h.matches("\\d{1,3}(\\.\\d{1,3}){3}")) return false;
        String[] p = h.split("\\.");
        int a = Integer.parseInt(p[0]), b = Integer.parseInt(p[1]);
        return a == 10 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168);
    }

    // 结果：{ ok: true, rx, tx, n, name } 或者 { err: 原因 }
    static JSONObject fetch(Context c) {
        JSONObject out = new JSONObject();
        try {
            SharedPreferences p = prefs(c);
            String url = p.getString("url", ""), k = p.getString("k", "");
            if (url.isEmpty() || k.isEmpty()) return out.put("err", "在 App 里打开面板添加");
            Uri u = Uri.parse(url);
            if (!"https".equals(u.getScheme()) && !("http".equals(u.getScheme()) && lanHost(u.getHost()))) return out.put("err", "地址不对，重新添加");
            HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
            h.setConnectTimeout(8000); h.setReadTimeout(12000);
            h.setRequestMethod("POST"); h.setDoOutput(true);
            h.setRequestProperty("Content-Type", "application/json");
            h.setRequestProperty("User-Agent", "RouterPanelApp/" + BuildConfig.VERSION_NAME + " widget");
            byte[] body = new JSONObject().put("jsonrpc", "2.0").put("id", 1).put("method", "panel/widget")
                    .put("params", new JSONObject().put("k", k)).put("client", "panel").toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream o = h.getOutputStream()) { o.write(body); }
            int code = h.getResponseCode();
            if (code != 200) return out.put("err", "连不上路由器（" + code + "）");
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            try (InputStream in = h.getInputStream()) { byte[] buf = new byte[4096]; int n; while ((n = in.read(buf)) > 0 && bo.size() < 65536) bo.write(buf, 0, n); }
            JSONObject j = new JSONObject(bo.toString("UTF-8"));
            if (j.has("error")) return out.put("err", j.getJSONObject("error").optString("message", "出错了"));
            JSONObject r = j.getJSONObject("result");
            p.edit().putString("last", r.toString()).putLong("at", System.currentTimeMillis()).apply();
            return r.put("ok", true);
        } catch (Exception e) {
            try { return out.put("err", "连不上路由器"); } catch (Exception x) { return out; }
        }
    }

    static String speed(JSONObject r, String k) {
        if (r == null || r.isNull(k)) return "—";
        double b = r.optDouble(k, -1);
        if (b < 0) return "—";
        if (b >= 1048576) return String.format(Locale.US, "%.1f MB/s", b / 1048576);
        if (b >= 1024) return Math.round(b / 1024) + " KB/s";
        return Math.round(b) + " B/s";
    }

    static void draw(Context c, JSONObject r) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, SpeedWidget.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_speed);
        SharedPreferences p = prefs(c);
        boolean ok = r.optBoolean("ok");
        JSONObject show = r;
        // 这次没取到：还显示上一次的数据，时间那里写原因
        if (!ok) { try { show = new JSONObject(p.getString("last", "{}")); } catch (Exception e) { show = new JSONObject(); } }
        String name = show.optString("name", p.getString("name", c.getString(R.string.app_name)));
        v.setTextViewText(R.id.w_name, name.isEmpty() ? c.getString(R.string.app_name) : name);
        v.setTextViewText(R.id.w_down, "↓ " + speed(show, "rx"));
        v.setTextViewText(R.id.w_up, "↑ " + speed(show, "tx"));
        v.setTextViewText(R.id.w_n, show.isNull("n") || !show.has("n") ? "" : "在线 " + show.optInt("n") + " 台");
        long at = ok ? System.currentTimeMillis() : p.getLong("at", 0);
        String t = at > 0 ? new SimpleDateFormat("HH:mm", Locale.CHINA).format(new Date(at)) : "";
        v.setTextViewText(R.id.w_at, ok ? t : r.optString("err", "连不上路由器"));
        // 点一下立刻刷新
        Intent i = new Intent(c, SpeedWidget.class).setAction(ACT);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        m.updateAppWidget(ids, v);
    }
}
