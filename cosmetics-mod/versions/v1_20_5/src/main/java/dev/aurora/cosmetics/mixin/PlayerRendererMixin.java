package dev.aurora.cosmetics.mixin;

import dev.aurora.cosmetics.CosmeticsLayer;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.LivingEntityRenderer;
import net.minecraft.client.render.entity.PlayerEntityRenderer;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** 플레이어 렌더러가 만들어질 때 치장품 레이어를 추가합니다. */
@Mixin(PlayerEntityRenderer.class)
public abstract class PlayerRendererMixin extends LivingEntityRenderer<AbstractClientPlayerEntity, PlayerEntityModel<AbstractClientPlayerEntity>> {
    private PlayerRendererMixin(EntityRendererFactory.Context ctx, PlayerEntityModel<AbstractClientPlayerEntity> model, float shadow) {
        super(ctx, model, shadow);
    }

    private static boolean aurora$logged;

    @Inject(method = "<init>", at = @At("TAIL"))
    private void aurora$addLayer(EntityRendererFactory.Context ctx, boolean slim, CallbackInfo ci) {
        this.addFeature(new CosmeticsLayer(this));
        if (!aurora$logged) { aurora$logged = true; System.out.println("[Aurora Cosmetics] 치장품 레이어를 플레이어 렌더러에 추가했습니다"); }
    }
}
