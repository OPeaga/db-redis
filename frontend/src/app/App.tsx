import React from 'react';
import { BancadaPage } from '@pages/bancada/BancadaPage';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-bg-canvas">
      <BancadaPage />
    </div>
  );
};

export default App;
