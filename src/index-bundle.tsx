import { render } from "solid-js/web";
import { ZenobiaPaymentButton } from "./components/ZenobiaPaymentButton";
import type {
  StatementItem,
  CreateTransferRequestResponse,
  TransferStatus,
} from "./components/ZenobiaPaymentButton";

type InitOpts = {
  target: string | HTMLElement;
  amount: number;
  url: string;
  statementItems?: StatementItem[];
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
        amount={opts.amount}
        url={opts.url}
        statementItems={opts.statementItems}
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
