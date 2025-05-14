import { render } from "solid-js/web";
import { ZenobiaPaymentButton } from "./components/ZenobiaPaymentButton";
import type {
  CreateTransferRequestResponse,
  TransferStatus,
} from "./components/ZenobiaPaymentButton";

type InitOpts = {
  amount: number;
  target: string | HTMLElement;
  metadata: Record<string, any>;
  url: string;
  buttonText?: string;
  buttonClass?: string;
  qrCodeSize?: number;
  onSuccess?: (res: CreateTransferRequestResponse) => void;
  onError?: (err: Error) => void;
  onStatusChange?: (status: TransferStatus) => void;
};

function initZenobiaPay(opts: InitOpts) {
  const targetEl =
    typeof opts.target === "string"
      ? document.querySelector(opts.target)
      : opts.target;

  if (!targetEl) {
    console.error("[zenobia-pay] target element not found:", opts.target);
    return;
  }

  render(
    () => (
      <ZenobiaPaymentButton
        url={opts.url}
        amount={opts.amount}
        metadata={opts.metadata}
        buttonText={opts.buttonText}
        buttonClass={opts.buttonClass}
        qrCodeSize={opts.qrCodeSize}
        onSuccess={opts.onSuccess}
        onError={opts.onError}
        onStatusChange={opts.onStatusChange}
      />
    ),
    targetEl
  );
}

// expose it globally
(window as any).ZenobiaPay = { init: initZenobiaPay };
