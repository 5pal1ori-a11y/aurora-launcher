package dev.aurora.cosmetics;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;

/**
 * 런처가 게임 폴더에 써 둔 aurora-cosmetics.json 을 읽습니다.
 * 형식: { "enabled": ["tophat", "halo", "wings"] }
 * 파일이 바뀌면 게임을 끄지 않아도 몇 초 안에 다시 읽습니다.
 */
public class AuroraCosmetics implements ClientModInitializer {
    private static final Path FILE = FabricLoader.getInstance().getGameDir().resolve("aurora-cosmetics.json");
    private static Set<String> enabled = Set.of();
    private static long lastCheck;
    private static long lastModified = -1;

    @Override
    public void onInitializeClient() {
        reload();
    }

    public static boolean has(String id) {
        long now = System.currentTimeMillis();
        if (now - lastCheck > 3000) {
            lastCheck = now;
            reload();
        }
        return enabled.contains(id);
    }

    private static void reload() {
        try {
            if (!Files.exists(FILE)) {
                enabled = Set.of();
                return;
            }
            long modified = Files.getLastModifiedTime(FILE).toMillis();
            if (modified == lastModified) return;
            lastModified = modified;
            JsonObject json = JsonParser.parseString(Files.readString(FILE)).getAsJsonObject();
            Set<String> next = new HashSet<>();
            if (json.has("enabled")) {
                for (JsonElement e : json.getAsJsonArray("enabled")) next.add(e.getAsString());
            }
            enabled = next;
        } catch (Exception e) {
            enabled = Set.of(); // 파일이 잘못돼도 게임은 계속 실행
        }
    }
}
