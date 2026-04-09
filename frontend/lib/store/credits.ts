import { create } from "zustand";
import { toast } from "sonner";
import { creditsApi } from "@/lib/api/credits";
import type {
  CreditsBalanceResponse,
  CreditsEstimateRequest,
  PaymentMethodType,
} from "@/lib/types";

interface CreditsState {
  balance: string;
  pricingPercent: number;
  estimateCost: string | null;
  canAfford: boolean;
  estimateError: string | null;
  isBalanceLoading: boolean;
  isEstimateLoading: boolean;

  // Top-up state
  selectedAmount: number;
  customAmount: string;
  paymentMethod: PaymentMethodType;
  isTopUpProcessing: boolean;

  loadBalance: () => Promise<void>;
  estimateGeneration: (payload: CreditsEstimateRequest) => Promise<void>;
  applyBalanceSnapshot: (payload: CreditsBalanceResponse) => void;
  clearEstimate: () => void;

  // Top-up actions
  setSelectedAmount: (amount: number) => void;
  setCustomAmount: (value: string) => void;
  setPaymentMethod: (method: PaymentMethodType) => void;
  createTopUp: () => Promise<void>;
}

export const useCreditsStore = create<CreditsState>()((set, get) => ({
  balance: "0.00",
  pricingPercent: 100,
  estimateCost: null,
  canAfford: false,
  estimateError: null,
  isBalanceLoading: false,
  isEstimateLoading: false,

  // Top-up defaults
  selectedAmount: 1000,
  customAmount: '',
  paymentMethod: 'sbp' as PaymentMethodType,
  isTopUpProcessing: false,

  loadBalance: async () => {
    set({ isBalanceLoading: true });
    try {
      const response = await creditsApi.getBalance();
      set({
        balance: response.balance,
        pricingPercent: response.pricing_percent,
        isBalanceLoading: false,
      });
    } catch (err) {
      set({ isBalanceLoading: false });
      toast.error("Не удалось загрузить баланс.");
      console.error("Failed to load balance:", err);
    }
  },

  estimateGeneration: async (payload: CreditsEstimateRequest) => {
    set({ isEstimateLoading: true, estimateError: null });
    try {
      const response = await creditsApi.estimate(payload);
      set({
        estimateCost: response.cost,
        balance: response.balance,
        canAfford: response.can_afford,
        estimateError: response.error,
        isEstimateLoading: false,
      });
    } catch (err) {
      set({
        isEstimateLoading: false,
        estimateError: "Не удалось рассчитать стоимость генерации.",
      });
      toast.error("Не удалось рассчитать стоимость генерации.");
      console.error("Failed to estimate generation:", err);
    }
  },

  applyBalanceSnapshot: (payload: CreditsBalanceResponse) => {
    set({
      balance: payload.balance,
      pricingPercent: payload.pricing_percent,
    });
  },

  clearEstimate: () => {
    set({
      estimateCost: null,
      canAfford: false,
      estimateError: null,
    });
  },

  // Top-up actions
  setSelectedAmount: (amount) => set({ selectedAmount: amount, customAmount: '' }),
  setCustomAmount: (value) => set({ customAmount: value, selectedAmount: 0 }),
  setPaymentMethod: (method) => set({ paymentMethod: method }),
  createTopUp: async () => {
    const { selectedAmount, customAmount, paymentMethod } = get();
    const amount = customAmount ? parseInt(customAmount, 10) : selectedAmount;
    if (!amount || amount < 100) return;

    set({ isTopUpProcessing: true });
    try {
      const response = await creditsApi.createTopUp({
        amount,
        payment_method_type: paymentMethod,
      });
      // Redirect to YooKassa payment page
      window.location.href = response.confirmation_url;
    } catch (error) {
      toast.error('Сервис оплаты временно недоступен');
      set({ isTopUpProcessing: false });
    }
  },
}));
