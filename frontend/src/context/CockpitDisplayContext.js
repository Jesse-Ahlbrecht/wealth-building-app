import React, { createContext, useContext } from 'react';

const CockpitDisplayContext = createContext({ valueMode: 'absolute' });

export const CockpitDisplayProvider = ({ valueMode, children }) => (
  <CockpitDisplayContext.Provider value={{ valueMode }}>
    {children}
  </CockpitDisplayContext.Provider>
);

export const useCockpitDisplay = () => useContext(CockpitDisplayContext);
