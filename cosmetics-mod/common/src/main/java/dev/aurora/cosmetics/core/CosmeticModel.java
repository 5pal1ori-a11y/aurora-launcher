package dev.aurora.cosmetics.core;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 치장품 모델 (모든 Minecraft 버전 공통).
 * cosmetics.json 은 런처 미리보기(cosmetics3d.js)와 같은 파일이며,
 * 상자 배치·텍스처 좌표·애니메이션 계산도 미리보기와 똑같이 맞춰 두었습니다.
 * Minecraft 클래스를 쓰지 않으므로 버전마다 다시 만들 필요가 없습니다.
 */
public final class CosmeticModel {
    /** 정점 하나를 받는 곳. 좌표는 뼈(머리/몸통) 기준 블록 단위. */
    public interface Sink {
        void vertex(float x, float y, float z, float u, float v, float nx, float ny, float nz, boolean glow);
    }

    public static final class Item {
        public String id, name, slot, bone, texture;
        public int tw, th;
        final List<Part> parts = new ArrayList<>();
        public boolean onHead() {
            return "head".equals(bone);
        }
    }

    static final class Part {
        float[] pivot = new float[3], rot = new float[3];
        float scale = 1;
        boolean glow;
        final List<Anim> anims = new ArrayList<>();
        final List<float[]> cubes = new ArrayList<>(); // x,y,z,w,h,d,u,v
        final List<Part> children = new ArrayList<>();
    }

    static final class Anim {
        String type, axis = "y";
        float amp, speed, phase, side = 1;
    }

    private static List<Item> items = Collections.emptyList();
    private static float texelsPerUnit = 2;

    public static synchronized List<Item> items() {
        if (items.isEmpty()) load();
        return items;
    }

    public static Item byId(String id) {
        for (Item i : items()) if (i.id.equals(id)) return i;
        return null;
    }

    private static void load() {
        try (InputStream in = CosmeticModel.class.getResourceAsStream("/assets/aurora_cosmetics/cosmetics.json")) {
            if (in == null) return;
            JsonObject root = new Gson().fromJson(new InputStreamReader(in, StandardCharsets.UTF_8), JsonObject.class);
            texelsPerUnit = root.get("texelsPerUnit").getAsFloat();
            List<Item> list = new ArrayList<>();
            for (JsonElement e : root.getAsJsonArray("items")) {
                JsonObject o = e.getAsJsonObject();
                Item it = new Item();
                it.id = o.get("id").getAsString();
                it.name = o.get("name").getAsString();
                it.slot = o.get("slot").getAsString();
                it.bone = o.get("bone").getAsString();
                it.texture = o.get("texture").getAsString();
                it.tw = o.get("tw").getAsInt();
                it.th = o.get("th").getAsInt();
                for (JsonElement p : o.getAsJsonArray("parts")) it.parts.add(part(p.getAsJsonObject()));
                list.add(it);
            }
            items = list;
        } catch (Exception ex) {
            items = Collections.emptyList();
        }
    }

    private static float[] vec(JsonObject o, String key) {
        float[] r = new float[3];
        if (o.has(key)) {
            JsonArray a = o.getAsJsonArray(key);
            for (int i = 0; i < 3; i++) r[i] = a.get(i).getAsFloat();
        }
        return r;
    }

    private static Part part(JsonObject o) {
        Part p = new Part();
        p.pivot = vec(o, "pivot");
        p.rot = vec(o, "rot");
        if (o.has("scale")) p.scale = o.get("scale").getAsFloat();
        p.glow = o.has("glow") && o.get("glow").getAsBoolean();
        if (o.has("anims")) {
            for (JsonElement e : o.getAsJsonArray("anims")) {
                JsonObject a = e.getAsJsonObject();
                Anim an = new Anim();
                an.type = a.get("type").getAsString();
                if (a.has("axis")) an.axis = a.get("axis").getAsString();
                if (a.has("amp")) an.amp = a.get("amp").getAsFloat();
                if (a.has("speed")) an.speed = a.get("speed").getAsFloat();
                if (a.has("phase")) an.phase = a.get("phase").getAsFloat();
                if (a.has("side")) an.side = a.get("side").getAsFloat();
                p.anims.add(an);
            }
        }
        for (JsonElement e : o.getAsJsonArray("cubes")) {
            JsonObject c = e.getAsJsonObject();
            float[] f = vec(c, "from"), s = vec(c, "size");
            JsonArray uv = c.getAsJsonArray("uv");
            p.cubes.add(new float[] {f[0], f[1], f[2], s[0], s[1], s[2], uv.get(0).getAsFloat(), uv.get(1).getAsFloat()});
        }
        if (o.has("children")) for (JsonElement e : o.getAsJsonArray("children")) p.children.add(part(e.getAsJsonObject()));
        return p;
    }

    // ───────── 그리기 ─────────

    /**
     * @param t    시간 (틱, 소수 가능)
     * @param move 걷는 정도 0~1
     * @param fly  겉날개로 나는 중이면 1
     */
    public static void emit(Item item, float t, float move, float fly, Sink sink) {
        float[] m = Mat.identity();
        for (Part p : item.parts) emitPart(item, p, m, t, move, fly, false, sink);
    }

    private static void emitPart(Item item, Part p, float[] parent, float t, float move, float fly, boolean glow, Sink sink) {
        // three.js 쪽과 같은 순서: T(pivot) · R(base, ZYX) · S(scale) · T(bob) · R(anim, ZYX)
        float[] m = Mat.mul(parent, Mat.translate(p.pivot[0], p.pivot[1], p.pivot[2]));
        m = Mat.mul(m, Mat.rotZYX(p.rot[0], p.rot[1], p.rot[2]));
        if (p.scale != 1) m = Mat.mul(m, Mat.scale(p.scale));
        float[] a = animate(p.anims, t, move, fly);
        if (a[3] != 0) m = Mat.mul(m, Mat.translate(0, a[3], 0));
        if (a[0] != 0 || a[1] != 0 || a[2] != 0) m = Mat.mul(m, Mat.rotZYX(a[0], a[1], a[2]));
        boolean g = glow || p.glow;
        for (float[] c : p.cubes) cube(item, c, m, g, sink);
        for (Part ch : p.children) emitPart(item, ch, m, t, move, fly, g, sink);
    }

    /** 반환: {rotX, rotY, rotZ, bobY} */
    static float[] animate(List<Anim> anims, float t, float move, float fly) {
        float[] r = new float[4];
        for (Anim a : anims) {
            int ax = "x".equals(a.axis) ? 0 : "z".equals(a.axis) ? 2 : 1;
            switch (a.type) {
                case "spin": r[1] += t * a.speed; break;
                case "bob": r[3] += a.amp * (float) Math.sin(t * a.speed + a.phase); break;
                case "sway": r[ax] += a.side * a.amp * (float) Math.sin(t * a.speed + a.phase) * (1 + move * 1.5f); break;
                case "flap": {
                    float k = 1 + move * 0.8f + fly * 1.2f;
                    r[ax] += a.side * a.amp * k * (float) Math.sin(t * a.speed * (1 + move * 0.6f + fly * 1.4f) + a.phase);
                    break;
                }
                case "twitch": r[ax] += a.side * a.amp * (float) Math.pow(Math.max(0, Math.sin(t * a.speed + a.phase)), 12); break;
                default: break;
            }
        }
        return r;
    }

    // 면 순서·방향은 cosmetics3d.js 의 cubeGeometry 와 같습니다.
    private static void cube(Item item, float[] c, float[] m, boolean glow, Sink sink) {
        float x0 = c[0], y0 = c[1], z0 = c[2], x1 = x0 + c[3], y1 = y0 + c[4], z1 = z0 + c[5];
        int W = Math.max(1, (int) Math.ceil(c[3] * texelsPerUnit));
        int H = Math.max(1, (int) Math.ceil(c[4] * texelsPerUnit));
        int D = Math.max(1, (int) Math.ceil(c[5] * texelsPerUnit));
        float u = c[6], v = c[7];
        face(item, m, glow, sink, u + D, v + D, W, H, 0, 0, -1, x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0);
        face(item, m, glow, sink, u + 2 * D + W, v + D, W, H, 0, 0, 1, x1, y0, z1, x0, y0, z1, x0, y1, z1, x1, y1, z1);
        face(item, m, glow, sink, u, v + D, D, H, -1, 0, 0, x0, y0, z1, x0, y0, z0, x0, y1, z0, x0, y1, z1);
        face(item, m, glow, sink, u + D + W, v + D, D, H, 1, 0, 0, x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0);
        face(item, m, glow, sink, u + D, v, W, D, 0, -1, 0, x0, y0, z1, x1, y0, z1, x1, y0, z0, x0, y0, z0);
        face(item, m, glow, sink, u + D + W, v, W, D, 0, 1, 0, x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1);
    }

    private static void face(Item item, float[] m, boolean glow, Sink sink, float fu, float fv, float fw, float fh,
                             float nx, float ny, float nz, float... q) {
        float[] n = Mat.dir(m, nx, ny, nz);
        float[][] uv = {{fu, fv}, {fu + fw, fv}, {fu + fw, fv + fh}, {fu, fv + fh}};
        for (int k = 0; k < 4; k++) {
            float[] p = Mat.point(m, q[k * 3], q[k * 3 + 1], q[k * 3 + 2]);
            sink.vertex(p[0] / 16f, p[1] / 16f, p[2] / 16f, uv[k][0] / item.tw, uv[k][1] / item.th, n[0], n[1], n[2], glow);
        }
    }

    /** 4x4 행렬 (열 우선) */
    static final class Mat {
        static float[] identity() {
            return new float[] {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
        }

        static float[] translate(float x, float y, float z) {
            float[] m = identity();
            m[12] = x;
            m[13] = y;
            m[14] = z;
            return m;
        }

        static float[] scale(float s) {
            float[] m = identity();
            m[0] = m[5] = m[10] = s;
            return m;
        }

        // R = Rz · Ry · Rx  (three.js Euler 'ZYX', Minecraft ModelPart 회전과 같은 순서)
        static float[] rotZYX(float x, float y, float z) {
            float cx = (float) Math.cos(x), sx = (float) Math.sin(x);
            float cy = (float) Math.cos(y), sy = (float) Math.sin(y);
            float cz = (float) Math.cos(z), sz = (float) Math.sin(z);
            float[] rx = {1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1};
            float[] ry = {cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1};
            float[] rz = {cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
            return mul(rz, mul(ry, rx));
        }

        static float[] mul(float[] a, float[] b) {
            float[] r = new float[16];
            for (int col = 0; col < 4; col++)
                for (int row = 0; row < 4; row++) {
                    float s = 0;
                    for (int k = 0; k < 4; k++) s += a[k * 4 + row] * b[col * 4 + k];
                    r[col * 4 + row] = s;
                }
            return r;
        }

        static float[] point(float[] m, float x, float y, float z) {
            return new float[] {m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]};
        }

        static float[] dir(float[] m, float x, float y, float z) {
            float a = m[0] * x + m[4] * y + m[8] * z, b = m[1] * x + m[5] * y + m[9] * z, c = m[2] * x + m[6] * y + m[10] * z;
            float l = (float) Math.sqrt(a * a + b * b + c * c);
            return l == 0 ? new float[] {0, 1, 0} : new float[] {a / l, b / l, c / l};
        }
    }

    private CosmeticModel() {}
}
