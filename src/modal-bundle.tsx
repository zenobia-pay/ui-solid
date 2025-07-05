import { render } from "solid-js/web";
import { ZenobiaPaymentModal } from "./components/ZenobiaPaymentModal";
import { zenobiaPaymentStyles } from "./components/ZenobiaPaymentStyles";
import type {
  TransferStatus,
  CreateTransferRequestResponse,
} from "./components/ZenobiaPaymentButton";

interface InitModalOpts {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  discountAmount?: number;
  qrCodeSize?: number;
  isTest?: boolean;
  url?: string;
  metadata?: Record<string, any>;
  transferRequest?: CreateTransferRequestResponse;
  hideQrOnMobile?: boolean;
  showCashback?: boolean;
  onSuccess?: (response: CreateTransferRequestResponse, status: any) => void;
  onError?: (err: Error) => void;
  onStatusChange?: (status: TransferStatus) => void;
  target: string | HTMLElement;
}

function injectZenobiaStyles() {
  if (!document.getElementById("zenobia-payment-styles")) {
    const style = document.createElement("style");
    style.id = "zenobia-payment-styles";
    style.textContent = zenobiaPaymentStyles;
    document.head.appendChild(style);
  }
}

function initZenobiaPayModal(opts: InitModalOpts) {
  const targetEl =
    typeof opts.target === "string"
      ? document.querySelector(opts.target)
      : opts.target;

  if (!targetEl) {
    console.error("[zenobia-pay-modal] target element not found:", opts.target);
    return;
  }

  injectZenobiaStyles();

  render(
    () => (
      <ZenobiaPaymentModal
        isOpen={opts.isOpen}
        onClose={opts.onClose}
        amount={opts.amount}
        discountAmount={opts.discountAmount}
        qrCodeSize={opts.qrCodeSize}
        isTest={opts.isTest}
        url={opts.url}
        metadata={opts.metadata}
        transferRequest={opts.transferRequest}
        hideQrOnMobile={opts.hideQrOnMobile}
        showCashback={opts.showCashback}
        onSuccess={opts.onSuccess}
        onError={opts.onError}
        onStatusChange={opts.onStatusChange}
      />
    ),
    targetEl
  );
}

(window as any).ZenobiaPayModal = { init: initZenobiaPayModal };
