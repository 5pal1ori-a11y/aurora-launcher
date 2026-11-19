package dev.aurora.cosmetics.mixin;

import dev.aurora.cosmetics.CosmeticsLayer;
import net.minecraft.client.entity.ClientAvatarEntity;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.world.entity.Avatar;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(AvatarRenderer.class)
public abstract class PlayerRendererMixin<E extends Avatar & ClientAvatarEntity> extends LivingEntityRenderer<E, AvatarRenderState, PlayerModel> {
    private PlayerRendererMixin(EntityRendererProvider.Context ctx, PlayerModel model, float shadow) {
        super(ctx, model, shadow);
    }

    private static boolean aurora$logged;

    @Inject(method = "<init>", at = @At("TAIL"))
    private void aurora$addLayer(EntityRendererProvider.Context ctx, boolean slim, CallbackInfo ci) {
        this.addLayer(new CosmeticsLayer(this));
        if (!aurora$logged) { aurora$logged = true; System.out.println("[Aurora Cosmetics] 치장품 레이어를 플레이어 렌더러에 추가했습니다"); }
    }
}
