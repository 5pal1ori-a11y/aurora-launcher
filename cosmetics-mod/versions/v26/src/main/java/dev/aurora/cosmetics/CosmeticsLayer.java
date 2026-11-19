package dev.aurora.cosmetics;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.aurora.cosmetics.core.CosmeticModel;
import dev.aurora.cosmetics.core.CosmeticsConfig;
import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;

import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Minecraft 26.x (난독화 없는 Mojang 이름) */
public class CosmeticsLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
    public CosmeticsLayer(RenderLayerParent<AvatarRenderState, PlayerModel> parent) {
        super(parent);
    }

    @Override
    public void submit(PoseStack poses, SubmitNodeCollector queue, int light, AvatarRenderState state, float yRot, float xRot) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || state.id != mc.player.getId() || state.isInvisible) return;
        List<CosmeticModel.Item> on = CosmeticsConfig.enabled();
        if (on.isEmpty()) return;
        float move = Math.min(1f, state.walkAnimationSpeed);
        float fly = state.isFallFlying ? 1f : 0f;
        float age = state.ageInTicks;
        for (CosmeticModel.Item item : on) {
            ModelPart bone = item.onHead() ? getParentModel().head : getParentModel().body;
            poses.pushPose();
            bone.translateAndRotate(poses);
            queue.submitCustomGeometry(poses, RenderTypes.entityCutout(texture(item)), (pose, vc) ->
                CosmeticModel.emit(item, age, move, fly, (x, y, z, u, v, nx, ny, nz, glow) ->
                    vc.addVertex(pose, x, y, z).setColor(-1).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY)
                      .setLight(glow ? 0xF000F0 : light).setNormal(pose, nx, ny, nz)));
            poses.popPose();
        }
    }

    // Fabric API 없이도 보이도록 텍스처를 모드 jar 에서 직접 읽어 등록합니다 (처음 쓸 때 한 번).
    private static final Map<String, Identifier> TEXTURES = new HashMap<>();

    private static Identifier texture(CosmeticModel.Item item) {
        return TEXTURES.computeIfAbsent(item.id, k -> {
            Identifier id = Identifier.fromNamespaceAndPath("aurora_cosmetics", "dynamic/" + item.id);
            try (InputStream in = CosmeticModel.class.getResourceAsStream("/assets/aurora_cosmetics/textures/cosmetics/" + item.texture)) {
                if (in != null) Minecraft.getInstance().getTextureManager().register(id, new DynamicTexture(() -> "aurora_cosmetics/" + item.id, NativeImage.read(in)));
            } catch (Exception e) {
                System.out.println("[Aurora Cosmetics] 텍스처를 불러오지 못했습니다: " + item.texture + " (" + e + ")");
            }
            return id;
        });
    }
}
