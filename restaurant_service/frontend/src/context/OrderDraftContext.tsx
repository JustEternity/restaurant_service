import React, { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export interface CartItem {
  item: any;
  quantity: number;
  comment: string;
  id?: number;
  course_number: number;
}

interface OrderDraft {
  tableIds: number[];
  cart: CartItem[];
  isActive: boolean;
}

interface OrderDraftContextType {
  draft: OrderDraft;
  setTableIds: (ids: number[]) => void;
  updateCart: (cart: CartItem[]) => void;
  clearDraft: () => void;
  activateDraft: () => void;
}

const OrderDraftContext = createContext<OrderDraftContextType>({} as OrderDraftContextType);

export const useOrderDraft = () => useContext(OrderDraftContext);

export const OrderDraftProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [drafts, setDrafts] = useState<Record<number, OrderDraft>>({});

  const safeUserId = user?.id ?? -1;

  const currentDraft: OrderDraft = drafts[safeUserId] ?? {
    tableIds: [],
    cart: [],
    isActive: false,
  };

  const updateDraft = useCallback(
    (patch: Partial<OrderDraft>) => {
      if (!user) return;
      setDrafts(prev => ({
        ...prev,
        [user.id]: { ...currentDraft, ...patch },
      }));
    },
    [user, currentDraft]
  );

  const setTableIds = useCallback((ids: number[]) => {
    updateDraft({ tableIds: ids });
  }, [updateDraft]);

  const updateCart = useCallback((cart: CartItem[]) => {
    updateDraft({ cart });
  }, [updateDraft]);

  const clearDraft = useCallback(
    () => updateDraft({ tableIds: [], cart: [], isActive: false }),
    [updateDraft]
  );

  const activateDraft = useCallback(
    () => updateDraft({ isActive: true }),
    [updateDraft]
  );

  return (
    <OrderDraftContext.Provider
      value={{
        draft: currentDraft,
        setTableIds,
        updateCart,
        clearDraft,
        activateDraft,
      }}
    >
      {children}
    </OrderDraftContext.Provider>
  );
};
