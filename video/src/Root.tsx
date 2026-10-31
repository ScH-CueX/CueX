import React from 'react';
import {Composition, Folder} from 'remotion';
import {loadFonts} from './fonts';
import {Promo, ScenePreview} from './Promo';
import {SCENES, TOTAL} from './content/timeline';
import {FPS, H, W} from './theme';
import {Demo45, DEMO_TOTAL} from './demo/Demo45';

loadFonts();

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="CueXDemo45" component={Demo45} durationInFrames={DEMO_TOTAL} fps={FPS} width={W} height={H} defaultProps={{voice:true}} />
    <Composition id="CueXPromo" component={Promo} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
    <Folder name="Scenes">
      {SCENES.map((s) => (
        <Composition key={s.id} id={`Scene-${s.id}`} component={ScenePreview} defaultProps={{id: s.id}} durationInFrames={s.dur} fps={FPS} width={W} height={H} />
      ))}
    </Folder>
  </>
);
