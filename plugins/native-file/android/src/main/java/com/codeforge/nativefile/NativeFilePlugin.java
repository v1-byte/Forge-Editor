package com.codeforge.nativefile;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;

/**
 * NativeFile — akses berkas native untuk CodeForge.
 *
 *  stat({ uri })                       -> { size }
 *  read({ uri, offset, length })       -> { data (base64), bytes }   maks 4 MB per panggilan
 *  pick()                              -> { uri, name, size } | { cancelled: true }
 *
 * uri bisa berupa:
 *  - content://...  (hasil pick, lewat Storage Access Framework)
 *  - file:///...    (lokasi app, mis. hasil Filesystem.getUri)
 *  - /path/absolut
 */
@CapacitorPlugin(name = "NativeFile")
public class NativeFilePlugin extends Plugin {

    private static final int MAX_CHUNK = 4 * 1024 * 1024;

    private interface Op<T> {
        T run(FileChannel ch, long size) throws Exception;
    }

    private <T> T withChannel(String uriStr, Op<T> op) throws Exception {
        if (uriStr.startsWith("content:")) {
            try (ParcelFileDescriptor pfd = getContext().getContentResolver()
                    .openFileDescriptor(Uri.parse(uriStr), "r")) {
                if (pfd == null) throw new IllegalStateException("URI tidak bisa dibuka");
                try (FileInputStream in = new FileInputStream(pfd.getFileDescriptor())) {
                    FileChannel ch = in.getChannel();
                    return op.run(ch, ch.size());
                }
            }
        }
        String path = uriStr.startsWith("file:") ? Uri.parse(uriStr).getPath() : uriStr;
        if (path == null) throw new IllegalArgumentException("Path tidak valid: " + uriStr);
        File f = new File(path);
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            return op.run(raf.getChannel(), raf.length());
        }
    }

    @PluginMethod
    public void stat(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) { call.reject("uri wajib diisi"); return; }
        try {
            long size = withChannel(uri, (ch, s) -> s);
            JSObject ret = new JSObject();
            ret.put("size", size);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("stat gagal: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) { call.reject("uri wajib diisi"); return; }
        final long offset = Math.max(0L, call.getLong("offset", 0L));
        final int want = Math.min(MAX_CHUNK, Math.max(0, call.getInt("length", 0)));
        try {
            byte[] bytes = withChannel(uri, (ch, size) -> {
                long n = Math.min((long) want, size - offset);
                if (n <= 0) return new byte[0];
                ByteBuffer buf = ByteBuffer.allocate((int) n);
                long pos = offset;
                while (buf.hasRemaining()) {
                    int r = ch.read(buf, pos);
                    if (r < 0) break;
                    pos += r;
                }
                buf.flip();
                byte[] out = new byte[buf.remaining()];
                buf.get(out);
                return out;
            });
            JSObject ret = new JSObject();
            ret.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
            ret.put("bytes", bytes.length);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("baca gagal: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }
        Uri uri = data.getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                    uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {
            // sebagian provider tidak mendukung izin persisten; tetap lanjut
        }
        JSObject ret = new JSObject();
        ret.put("uri", uri.toString());
        ret.put("name", displayName(uri));
        ret.put("size", sizeOf(uri));
        call.resolve(ret);
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0 && !c.isNull(i)) return c.getString(i);
            }
        } catch (Exception ignored) { }
        String last = uri.getLastPathSegment();
        return last != null ? last : "berkas";
    }

    private long sizeOf(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.SIZE);
                if (i >= 0 && !c.isNull(i)) return c.getLong(i);
            }
        } catch (Exception ignored) { }
        return -1L; // tidak diketahui; front-end memanggil stat()
    }
}
