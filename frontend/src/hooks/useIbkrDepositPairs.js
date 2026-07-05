import { useReloadIbkrDepositPairs } from '../context/PairDataContext';

export function useIbkrDepositPairs() {
  const reloadIbkrDepositPairs = useReloadIbkrDepositPairs();
  return { reloadIbkrDepositPairs };
}
