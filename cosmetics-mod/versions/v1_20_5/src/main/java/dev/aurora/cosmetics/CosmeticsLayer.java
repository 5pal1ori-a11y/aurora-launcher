package dev.aurora.cosmetics;

import dev.aurora.cosmetics.core.CosmeticModel;
import dev.aurora.cosmetics.core.CosmeticsConfig;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.model.ModelPart;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.feature.FeatureRenderer;
import net.minecraft.client.render.entity.feature.FeatureRendererContext;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.Identifier;

import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Minecraft 1.20.5 ~ 1.20.6 */
public class CosmeticsLayer extends FeatureRenderer<AbstractClientPlayerEntity, PlayerEntityModel<AbstractClientPlayerEntity>> {
    public CosmeticsLayer(FeatureRendererContext<AbstractClientPlayerEntity, PlayerEntityModel<AbstractClientPlayerEntity>> ctx) {
        super(ctx);
    }

    @Override
    public void render(MatrixStack matrices, VertexConsumerProvider vcp, int light, AbstractClientPlayerEntity player,
                       float limbAngle, float limbDistance, float tickDelta, float age, float headYaw, float headPitch) {
        if (player != MinecraftClient.getInstance().player || player.isInvisible()) return;
        List<CosmeticModel.Item> on = CosmeticsConfig.enabled();
        if (on.isEmpty()) return;
        float move = Math.min(1f, limbDistance);
        float fly = player.isFallFlying() ? 1f : 0f;
        for (CosmeticModel.Item item : on) {
            VertexConsumer vc = vcp.getBuffer(RenderLayer.getEntityCutoutNoCull(texture(item)));
            ModelPart bone = item.onHead() ? getContextModel().head : getContextModel().body;
            matrices.push();
            bone.rotate(matrices);
            MatrixStack.Entry e = matrices.peek();
            CosmeticModel.emit(item, age, move, fly, (x, y, z, u, v, nx, ny, nz, glow) ->
                vc.vertex(e.getPositionMatrix(), x, y, z).color(255, 255, 255, 255).texture(u, v).overlay(OverlayTexture.DEFAULT_UV)
                  .light(glow ? 0xF000F0 : light).normal(e, nx, ny, nz).next());
            matrices.pop();
        }
    }

    // Fabric API 없이도 보이도록 텍스처를 모드 jar 에서 직접 읽어 등록합니다 (처음 쓸 때 한 번).
    private static final Map<String, Identifier> TEXTURES = new HashMap<>();

    private static Identifier texture(CosmeticModel.Item item) {
        return TEXTURES.computeIfAbsent(item.id, k -> {
            Identifier id = new Identifier("aurora_cosmetics", "dynamic/" + item.id);
            try (InputStream in = CosmeticModel.class.getResourceAsStream("/assets/aurora_cosmetics/textures/cosmetics/" + item.texture)) {
                if (in != null) MinecraftClient.getInstance().getTextureManager().registerTexture(id, new NativeImageBackedTexture(NativeImage.read(in)));
            } catch (Exception e) {
                System.out.println("[Aurora Cosmetics] 텍스처를 불러오지 못했습니다: " + item.texture + " (" + e + ")");
            }
            return id;
        });
    }
}
