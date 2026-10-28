import { create } from "zustand";

interface ToastState {
  message: string | null;
  key: number;
  show: (message: string) => void;
  clear: () => void;
}

export const useToast = create<ToastState>()((set) => ({
  message: null,
  key: 0,
  show: (message) => set((s) => ({ message, key: s.key + 1 })),
  clear: () => set({ message: null }),
}));

export const toast = (message: string) => useToast.getState().show(message);
