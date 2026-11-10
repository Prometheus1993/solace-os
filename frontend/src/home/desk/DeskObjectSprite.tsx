import { DeskSprite } from './DeskSprite.tsx';
import { deskSpriteSpec, type DeskStyle } from './desk-sprite-catalog.ts';
import type { DeskObjectId } from './desk-layout-state.ts';
import { deskAsset } from './desk-assets.ts';

export function DeskObjectSprite({
  id,
  appearance = 'original',
  state,
  onError
}: { id: DeskObjectId; appearance?: DeskStyle; state?: number; onError?: () => void }) {
  const { asset, ...sampling } = deskSpriteSpec(id, appearance, state);
  return <DeskSprite src={deskAsset(asset)} {...sampling} name={id} onError={onError} />;
}
