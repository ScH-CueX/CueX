import React from 'react';
import {Composition, Folder} from 'remotion';
import {loadFonts} from './fonts';
import {Promo, ScenePreview} from './Promo';
import {SCENES, TOTAL} from './content/timeline';
import {FPS, H, W} from './theme';

loadFonts();

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="CueXPromo" component={Promo} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
    <Folder name="Scenes">
      {SCENES.map((s) => (
        <Composition key={s.id} id={`Scene-${s.id}`} component={ScenePreview} defaultProps={{id: s.id}} durationInFrames={s.dur} fps={FPS} width={W} height={H} />
      ))}
    </Folder>
  </>
);
