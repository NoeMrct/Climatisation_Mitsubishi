import { Section, SubHeader } from '../ui/controls';
import { LINKS } from '../ui/hooks';
import { AimChips, ClimStage, FanControls } from '../ui/panels';

export function Airflow() {
  return (
    <main className="screen screen--flux">
      <SubHeader title="Flux d’air" back={LINKS.home} backLabel="Retour à l’accueil" />
      <ClimStage />
      <AimChips />
      <Section label="Ventilation">
        <div className="card card--pad">
          <FanControls />
        </div>
      </Section>
    </main>
  );
}
