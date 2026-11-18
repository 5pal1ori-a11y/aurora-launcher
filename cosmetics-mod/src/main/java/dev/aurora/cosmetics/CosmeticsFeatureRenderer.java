package dev.aurora.cosmetics;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.model.ModelData;
import net.minecraft.client.model.ModelPart;
import net.minecraft.client.model.ModelPartBuilder;
import net.minecraft.client.model.ModelPartData;
import net.minecraft.client.model.ModelTransform;
import net.minecraft.client.model.TexturedModelData;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.feature.FeatureRenderer;
import net.minecraft.client.render.entity.feature.FeatureRendererContext;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.RotationAxis;

/**
 * 내 캐릭터에게만 치장품을 그립니다 (다른 플레이어 화면에는 보이지 않습니다).
 * 텍스처 파일 없이, 흰색 텍스처 한 장에 색만 입혀서 상자 모양으로 그립니다.
 */
public class CosmeticsFeatureRenderer
        extends FeatureRenderer<AbstractClientPlayerEntity, PlayerEntityModel<AbstractClientPlayerEntity>> {

    private static final Identifier WHITE = Identifier.of("aurora_cosmetics", "white");
    private static final int FULL_BRIGHT = 0xF000F0;
    private static boolean textureReady;

    private static final int BLACK = 0xFF1B1B24;
    private static final int RED = 0xFFD63B4E;
    private static final int GOLD = 0xFFF7C948;
    private static final int GEM = 0xFF3DF5C1;
    private static final int HALO = 0xFFFFF2A8;
    private static final int WING = 0xFFF4F7FF;
    private static final int WING_TIP = 0xFFAFC8FF;

    private final ModelPart hatBrim = box(-5.5f, -9f, -5.5f, 11f, 1f, 11f);
    private final ModelPart hatBand = box(-4.2f, -10.5f, -4.2f, 8.4f, 1.5f, 8.4f);
    private final ModelPart hatTop = box(-4f, -16f, -4f, 8f, 5.5f, 8f);

    private final ModelPart crownRing = box(-4.5f, -10f, -4.5f, 9f, 2f, 9f);
    private final ModelPart crownSpike = box(-1f, -12.5f, -1f, 2f, 2.5f, 2f);
    private final ModelPart crownGem = box(-0.75f, -9.7f, -4.9f, 1.5f, 1.5f, 0.5f);

    private final ModelPart haloBar = box(-4f, -0.5f, -0.5f, 8f, 1f, 1f);

    private final ModelPart wingInner = box(0f, 0f, 0f, 7f, 10f, 1f);
    private final ModelPart wingOuter = box(7f, 1f, 0f, 6f, 12f, 1f);
    private final ModelPart wingTip = box(13f, 4f, 0f, 4f, 11f, 1f);

    public CosmeticsFeatureRenderer(
            FeatureRendererContext<AbstractClientPlayerEntity, PlayerEntityModel<AbstractClientPlayerEntity>> context) {
        super(context);
    }

    private static ModelPart box(float x, float y, float z, float w, float h, float d) {
        ModelData data = new ModelData();
        ModelPartData root = data.getRoot();
        root.addChild("box", ModelPartBuilder.create().uv(0, 0).cuboid(x, y, z, w, h, d), ModelTransform.NONE);
        return TexturedModelData.of(data, 16, 16).createModel().getChild("box");
    }

    private static void ensureTexture() {
        if (textureReady) return;
        NativeImage image = new NativeImage(16, 16, false);
        image.fillRect(0, 0, 16, 16, 0xFFFFFFFF);
        MinecraftClient.getInstance().getTextureManager().registerTexture(WHITE, new NativeImageBackedTexture(image));
        textureReady = true;
    }

    @Override
    public void render(MatrixStack matrices, VertexConsumerProvider vertexConsumers, int light,
                       AbstractClientPlayerEntity player, float limbAngle, float limbDistance, float tickDelta,
                       float animationProgress, float headYaw, float headPitch) {
        if (player != MinecraftClient.getInstance().player || player.isInvisible()) return;

        boolean hat = AuroraCosmetics.has("tophat");
        boolean crown = AuroraCosmetics.has("crown");
        boolean halo = AuroraCosmetics.has("halo");
        boolean wings = AuroraCosmetics.has("wings");
        if (!hat && !crown && !halo && !wings) return;

        ensureTexture();
        VertexConsumer buffer = vertexConsumers.getBuffer(RenderLayer.getEntityCutoutNoCull(WHITE));
        int overlay = OverlayTexture.DEFAULT_UV;
        PlayerEntityModel<AbstractClientPlayerEntity> model = getContextModel();

        if (hat || crown || halo) {
            matrices.push();
            model.head.rotate(matrices);
            if (hat) {
                hatBrim.render(matrices, buffer, light, overlay, BLACK);
                hatBand.render(matrices, buffer, light, overlay, RED);
                hatTop.render(matrices, buffer, light, overlay, BLACK);
            } else if (crown) {
                crownRing.render(matrices, buffer, light, overlay, GOLD);
                crownGem.render(matrices, buffer, FULL_BRIGHT, overlay, GEM);
                for (int i = 0; i < 4; i++) {
                    matrices.push();
                    matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(i * 90f));
                    matrices.translate(3.5f / 16f, 0f, 3.5f / 16f);
                    crownSpike.render(matrices, buffer, light, overlay, GOLD);
                    matrices.pop();
                }
            }
            if (halo) {
                float bob = MathHelper.sin(animationProgress * 0.08f) * 0.6f;
                float height = (hat ? -19.5f : crown ? -15.5f : -11.5f) + bob;
                matrices.push();
                matrices.translate(0f, height / 16f, 0f);
                matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(animationProgress * 2f));
                for (int i = 0; i < 4; i++) {
                    matrices.push();
                    matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(i * 90f));
                    matrices.translate(0f, 0f, 4f / 16f);
                    haloBar.render(matrices, buffer, FULL_BRIGHT, overlay, HALO);
                    matrices.pop();
                }
                matrices.pop();
            }
            matrices.pop();
        }

        if (wings) {
            float flap = 25f + MathHelper.sin(animationProgress * 0.12f) * 12f + Math.min(limbDistance, 1f) * 10f;
            for (int side = -1; side <= 1; side += 2) {
                matrices.push();
                model.body.rotate(matrices);
                matrices.translate(side * 1f / 16f, 1f / 16f, 2f / 16f);
                if (side < 0) matrices.scale(-1f, 1f, 1f);
                matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(-flap));
                matrices.multiply(RotationAxis.POSITIVE_Z.rotationDegrees(-12f));
                wingInner.render(matrices, buffer, light, overlay, WING);
                wingOuter.render(matrices, buffer, light, overlay, WING);
                wingTip.render(matrices, buffer, light, overlay, WING_TIP);
                matrices.pop();
            }
        }
    }
}
