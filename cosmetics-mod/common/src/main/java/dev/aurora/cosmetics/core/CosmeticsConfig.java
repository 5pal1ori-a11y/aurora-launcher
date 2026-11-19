package dev.aurora.cosmetics.core;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.loader.api.FabricLoader;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 런처가 게임 폴더에 써 둔 aurora-cosmetics.json 을 읽습니다.
 * 형식: { "enabled": ["tophat", "angel_wings"] }
 * 게임을 켜 둔 채 런처에서 바꿔도 몇 초 안에 반영됩니다.
 */
public final class CosmeticsConfig {
    private static final Path FILE = FabricLoader.getInstance().getGameDir().resolve("aurora-cosmetics.json");
    private static List<CosmeticModel.Item> enabled = Collections.emptyList();
    private static long lastCheck;
    private static long lastModified = -1;

    public static List<CosmeticModel.Item> enabled() {
        long now = System.currentTimeMillis();
        if (now - lastCheck > 2000) {
            lastCheck = now;
            reload();
        }
        return enabled;
    }

    private static void reload() {
        try {
            if (!Files.exists(FILE)) {
                enabled = Collections.emptyList();
                return;
            }
            long modified = Files.getLastModifiedTime(FILE).toMillis();
            if (modified == lastModified) return;
            lastModified = modified;
            JsonObject json = JsonParser.parseString(new String(Files.readAllBytes(FILE), StandardCharsets.UTF_8)).getAsJsonObject();
            List<CosmeticModel.Item> next = new ArrayList<>();
            if (json.has("enabled")) {
                for (JsonElement e : json.getAsJsonArray("enabled")) {
                    CosmeticModel.Item it = CosmeticModel.byId(e.getAsString());
                    if (it != null) next.add(it);
                }
            }
            enabled = next;
        } catch (Exception e) {
            enabled = Collections.emptyList(); // 파일이 잘못돼도 게임은 계속
        }
    }

    private CosmeticsConfig() {}
}
