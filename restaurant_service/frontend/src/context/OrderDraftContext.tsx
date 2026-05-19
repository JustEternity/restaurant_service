import React, { createContext, useContext, useState, useCallback } from 'react';

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
  const [draft, setDraft] = useState<OrderDraft>({
    tableIds: [],
    cart: [],
    isActive: false,
  });

  const setTableIds = useCallback((ids: number[]) => {
    setDraft(prev => ({ ...prev, tableIds: ids }));
  }, []);

  const updateCart = useCallback((cart: CartItem[]) => {
    setDraft(prev => ({ ...prev, cart }));
  }, []);

  const clearDraft = useCallback(() => {
    setDraft({ tableIds: [], cart: [], isActive: false });
  }, []);

  const activateDraft = useCallback(() => {
    setDraft(prev => ({ ...prev, isActive: true }));
  }, []);

  return (
    <OrderDraftContext.Provider value={{ draft, setTableIds, updateCart, clearDraft, activateDraft }}>
      {children}
    </OrderDraftContext.Provider>
  );
};