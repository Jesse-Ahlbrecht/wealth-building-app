import React, { createContext, useContext, useMemo, useState } from 'react';

const PredictionMenuContext = createContext(null);

export const PredictionMenuProvider = ({ children }) => {
  const [openKey, setOpenKey] = useState(null);
  const value = useMemo(() => ({ openKey, setOpenKey }), [openKey]);
  return (
    <PredictionMenuContext.Provider value={value}>
      {children}
    </PredictionMenuContext.Provider>
  );
};

export const usePredictionMenu = () => useContext(PredictionMenuContext);
