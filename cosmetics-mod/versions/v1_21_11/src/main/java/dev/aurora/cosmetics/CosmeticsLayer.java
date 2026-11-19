package dev.aurora.cosmetics;

import dev.aurora.cosmetics.core.CosmeticModel;
import dev.aurora.cosmetics.core.CosmeticsConfig;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.model.ModelPart;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.command.OrderedRenderCommandQueue;
import net.minecraft.client.render.entity.feature.FeatureRenderer;
import net.minecraft.client.render.entity.feature.FeatureRendererContext;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import net.minecraft.client.render.entity.state.PlayerEntityRenderState;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.Identifier;

import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Minecraft 1.21.11 (렌더 명령 대기열 방식) */
public class CosmeticsLayer extends FeatureRenderer<PlayerEntityRenderState, PlayerEntityModel> {
    public CosmeticsLayer(FeatureRendererContext<PlayerEntityRenderState, PlayerEntityModel> ctx) {
        super(ctx);
    }

    @Override
    public void render(MatrixStack matrices, OrderedRenderCommandQueue queue, int light, PlayerEntityRenderState state, float limbAngle, float limbDistance) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player == null || state.id != mc.player.getId() || state.invisible) return;
        List<CosmeticModel.Item> on = CosmeticsConfig.enabled();
        if (on.isEmpty()) return;
        float move = Math.min(1f, state.limbSwingAmplitude);
        float fly = state.isGliding ? 1f : 0f;
        float age = state.age;
        for (CosmeticModel.Item item : on) {
            ModelPart bone = item.onHead() ? getContextModel().head : getContextModel().body;
            matrices.push();
            bone.applyTransform(matrices);
            queue.submitCustom(matrices, RenderLayers.entityCutoutNoCull(texture(item)), (e, vc) ->
                CosmeticModel.emit(item, age, move, fly, (x, y, z, u, v, nx, ny, nz, glow) ->
                    vc.vertex(e, x, y, z).color(-1).texture(u, v).overlay(OverlayTexture.DEFAULT_UV)
                      .light(glow ? 0xF000F0 : light).normal(e, nx, ny, nz)));
            matrices.pop();
        }
    }

    // Fabric API 없이도 보이도록 텍스처를 모드 jar 에서 직접 읽어 등록합니다 (처음 쓸 때 한 번).
    private static final Map<String, Identifier> TEXTURES = new HashMap<>();

    private static Identifier texture(CosmeticModel.Item item) {
        return TEXTURES.computeIfAbsent(item.id, k -> {
            Identifier id = Identifier.of("aurora_cosmetics", "dynamic/" + item.id);
            try (InputStream in = CosmeticModel.class.getResourceAsStream("/assets/aurora_cosmetics/textures/cosmetics/" + item.texture)) {
                if (in != null) MinecraftClient.getInstance().getTextureManager().registerTexture(id, new NativeImageBackedTexture(() -> "aurora_cosmetics/" + item.id, NativeImage.read(in)));
            } catch (Exception e) {
                System.out.println("[Aurora Cosmetics] 텍스처를 불러오지 못했습니다: " + item.texture + " (" + e + ")");
            }
            return id;
        });
    }
}
