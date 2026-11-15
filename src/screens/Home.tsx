import { ROOM_NAME } from '../domain/capabilities';
import { useApp } from '../store/hooks';
import { statusText } from '../store/view';
import { RoundLink, StatusLine } from '../ui/controls';
import { ClimStage, TempBlock, Tiles } from '../ui/panels';
import { LINKS } from '../ui/routes';

export function Home() {
  const snapshot = useApp();
  return (
    <main className="screen screen--home">
      <header className="home-head">
        <div className="home-head__titles">
          <h1 className="title">{ROOM_NAME}</h1>
          <StatusLine text={statusText(snapshot)} online={snapshot.clim.online} />
        </div>
        <div className="home-head__actions">
          <RoundLink href={LINKS.programme} label="Programmation" icon="clock" />
          <RoundLink href={LINKS.modes} label="Mode et options" icon="sliders" />
        </div>
      </header>
      <ClimStage />
      <TempBlock />
      <Tiles />
    </main>
  );
}
