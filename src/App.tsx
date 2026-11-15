import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Airflow } from './screens/Airflow';
import { Desktop } from './screens/Desktop';
import { Forecast } from './screens/Forecast';
import { Home } from './screens/Home';
import { Modes } from './screens/Modes';
import { NotificationSettings } from './screens/NotificationSettings';
import { Programme } from './screens/Programme';
import { Regulation } from './screens/Regulation';
import { Simulator } from './screens/Simulator';
import { useApp } from './store/hooks';
import { climLook } from './store/view';
import { useHashRoute, useMediaQuery } from './ui/hooks';
import type { Route } from './ui/routes';

function screenFor(route: Route, wide: boolean): ReactNode {
  switch (route) {
    case 'programme':
      return <Programme />;
    case 'auto':
      return <Regulation />;
    case 'prevision':
      return <Forecast />;
    case 'notifications':
      return <NotificationSettings />;
    case 'simulateur':
      return <Simulator />;
    case 'flux':
      return wide ? <Desktop /> : <Airflow />;
    case 'modes':
      return wide ? <Desktop /> : <Modes />;
    case 'home':
      return wide ? <Desktop /> : <Home />;
  }
}

export default function App() {
  const route = useHashRoute();
  const wide = useMediaQuery('(min-width: 980px)');
  const { clim } = useApp();
  const { accent } = climLook(clim);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  const theme = { '--acc': accent.color, '--acc-rgb': accent.rgb } as CSSProperties;
  return (
    <div className="app" style={theme}>
      {screenFor(route, wide)}
    </div>
  );
}
