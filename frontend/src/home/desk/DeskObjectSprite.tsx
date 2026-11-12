import { DeskSprite } from './DeskSprite.tsx';
import { deskSpriteSpec } from './desk-sprite-catalog.ts';
import type { DeskObjectId } from './desk-layout-state.ts';
import { deskAsset } from './desk-assets.ts';
import { isReceiver } from './desk-light.ts';

export function DeskObjectSprite({
  id,
  state,
  onError
}: { id: DeskObjectId; state?: number; onError?: () => void }) {
  const { asset, ...sampling } = deskSpriteSpec(id, state);
  return <DeskSprite src={deskAsset(asset)} {...sampling} lit={isReceiver(id)} name={id} onError={onError} />;
}
