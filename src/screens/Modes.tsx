import { useApp } from '../store/hooks';
import { regulationLine } from '../store/view';
import { LinkRow, Section, SubHeader } from '../ui/controls';
import { ModeList, OptionList } from '../ui/panels';
import { LINKS } from '../ui/routes';

export function Modes() {
  const snapshot = useApp();
  return (
    <main className="screen">
      <SubHeader title="Mode et options" back={LINKS.home} backLabel="Retour à l’accueil" />
      <Section label="Mode">
        <div className="card">
          <ModeList />
        </div>
      </Section>
      <Section label="Options">
        <div className="card">
          <OptionList />
        </div>
      </Section>
      <Section label="Automatisation">
        <div className="link-stack">
          <LinkRow href={LINKS.auto} icon="auto" title="Régulation auto" sub={regulationLine(snapshot)} />
          {snapshot.simulator && (
            <LinkRow href={LINKS.simulateur} icon="sliders" title="Simulateur" sub="Météo et vitesse du temps" />
          )}
        </div>
      </Section>
    </main>
  );
}
