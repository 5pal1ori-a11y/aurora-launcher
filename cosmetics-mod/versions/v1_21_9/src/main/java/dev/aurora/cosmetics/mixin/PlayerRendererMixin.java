package dev.aurora.cosmetics.mixin;

import dev.aurora.cosmetics.CosmeticsLayer;
import net.minecraft.client.network.ClientPlayerLikeEntity;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.LivingEntityRenderer;
import net.minecraft.client.render.entity.PlayerEntityRenderer;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import net.minecraft.client.render.entity.state.PlayerEntityRenderState;
import net.minecraft.entity.PlayerLikeEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(PlayerEntityRenderer.class)
public abstract class PlayerRendererMixin<E extends PlayerLikeEntity & ClientPlayerLikeEntity> extends LivingEntityRenderer<E, PlayerEntityRenderState, PlayerEntityModel> {
    private PlayerRendererMixin(EntityRendererFactory.Context ctx, PlayerEntityModel model, float shadow) {
        super(ctx, model, shadow);
    }

    private static boolean aurora$logged;

    @Inject(method = "<init>", at = @At("TAIL"))
    private void aurora$addLayer(EntityRendererFactory.Context ctx, boolean slim, CallbackInfo ci) {
        this.addFeature(new CosmeticsLayer(this));
        if (!aurora$logged) { aurora$logged = true; System.out.println("[Aurora Cosmetics] 치장품 레이어를 플레이어 렌더러에 추가했습니다"); }
    }
}
