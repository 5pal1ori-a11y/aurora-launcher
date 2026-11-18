package dev.aurora.cosmetics.mixin;

import dev.aurora.cosmetics.CosmeticsFeatureRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.PlayerEntityRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** 플레이어 렌더러가 만들어질 때 치장품 레이어를 하나 추가합니다. */
@Mixin(PlayerEntityRenderer.class)
public abstract class PlayerEntityRendererMixin {
    @Inject(method = "<init>", at = @At("TAIL"))
    private void aurora$addCosmetics(EntityRendererFactory.Context ctx, boolean slim, CallbackInfo ci) {
        PlayerEntityRenderer self = (PlayerEntityRenderer) (Object) this;
        self.addFeature(new CosmeticsFeatureRenderer(self));
    }
}
