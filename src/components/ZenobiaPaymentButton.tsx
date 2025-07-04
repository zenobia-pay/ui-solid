import { createSignal, Component, Show } from "solid-js";
import { ZenobiaPaymentModal } from "./ZenobiaPaymentModal";
import { zenobiaPaymentStyles } from "./ZenobiaPaymentStyles";

export interface CreateTransferRequestResponse {
  transferRequestId: string;
  merchantId?: string;
  expiry?: number;
  signature?: string;
}

// Define the TransferStatus enum
export enum TransferStatus {
  PENDING = "PENDING",
  IN_FLIGHT = "IN_FLIGHT",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

// Define an enum for QR code position
export enum QrPosition {
  ABOVE = "ABOVE",
  BELOW = "BELOW",
  POPUP = "POPUP",
}

// Define interface for client TransferStatus
interface ClientTransferStatus {
  status: string;
  [key: string]: any;
}

interface ZenobiaPaymentButtonProps {
  amount: number;
  url: string; // Full URL to the payment endpoint
  metadata?: Record<string, any>; // Optional metadata
  buttonText?: string;
  isTest?: boolean;
  buttonClass?: string;
  qrCodeSize?: number;
  discountAmount?: number; // discount amount in cents
  hideQrOnMobile?: boolean; // New prop to control QR display on mobile
  showCashback?: boolean; // New prop to control cashback display
  onSuccess?: (
    response: CreateTransferRequestResponse,
    status: ClientTransferStatus
  ) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: TransferStatus) => void;
  qrPosition?: QrPosition;
}

// Define animation states
enum AnimationState {
  INITIAL = "INITIAL",
  BUTTON_CLOSING = "BUTTON_CLOSING",
  QR_EXPANDING = "QR_EXPANDING",
  QR_VISIBLE = "QR_VISIBLE",
}

// Utility function to detect iOS devices
const isIOS = (): boolean => {
  if (typeof window === "undefined") return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  return (
    /iphone|ipad|ipod/.test(userAgent) ||
    (userAgent.includes("mac") && "ontouchend" in document)
  );
};

export const ZenobiaPaymentButton: Component<ZenobiaPaymentButtonProps> = (
  props
) => {
  const [animationState, setAnimationState] = createSignal<AnimationState>(
    AnimationState.INITIAL
  );
  const [isClosing, setIsClosing] = createSignal<boolean>(false);

  // Get savings text for button
  const getSavingsText = () => {
    const discount = props.discountAmount || 0;
    if (discount == 0) {
      return props.buttonText;
    } else if (discount < 1000) {
      // Less than $10 (in cents)
      const percentage = ((discount / props.amount) * 100).toFixed(0);
      return `Get ${percentage}% cashback`;
    } else {
      return `Get $${(discount / 100).toFixed(2)} cashback`;
    }
  };

  const handleClick = () => {
    // Show QR screen immediately with placeholder
    setAnimationState(AnimationState.QR_EXPANDING);

    // Add a small delay for the animation
    setTimeout(() => {
      setAnimationState(AnimationState.QR_VISIBLE);
    }, 300);
  };

  const handleClose = () => {
    // Set closing state to trigger text animation
    setIsClosing(true);

    // Hide the modal immediately
    setAnimationState(AnimationState.INITIAL);

    // Wait for animation to complete before resetting state
    setTimeout(() => {
      // Reset closing state after animation completes
      setTimeout(() => {
        setIsClosing(false);
      }, 300); // Match the CSS transition duration
    }, 50);
  };

  return (
    <div class="zenobia-payment-container">
      <style>{zenobiaPaymentStyles}</style>

      {/* Payment Button */}
      <button
        class="zenobia-payment-button"
        classList={{
          "modal-open": animationState() !== AnimationState.INITIAL,
          closing: isClosing(),
        }}
        style={{
          "background-color": "black",
        }}
        onClick={handleClick}
        disabled={animationState() !== AnimationState.INITIAL}
      >
        {animationState() !== AnimationState.INITIAL && !isClosing() ? (
          props.buttonText || `Pay ${(props.amount / 100).toFixed(2)}`
        ) : (
          <div class="button-text-container">
            <div class="initial-text">{getSavingsText()}</div>
            <div class="hover-text">
              {props.buttonText || "Pay with Zenobia"}
            </div>
          </div>
        )}
      </button>

      {/* QR Code Modal */}
      <Show
        when={
          animationState() === AnimationState.QR_EXPANDING ||
          animationState() === AnimationState.QR_VISIBLE
        }
      >
        <ZenobiaPaymentModal
          isOpen={animationState() === AnimationState.QR_VISIBLE}
          onClose={handleClose}
          amount={props.amount}
          discountAmount={props.discountAmount}
          qrCodeSize={props.qrCodeSize}
          isTest={props.isTest}
          url={props.url}
          metadata={props.metadata}
          onSuccess={props.onSuccess}
          onError={props.onError}
          onStatusChange={props.onStatusChange}
          hideQrOnMobile={props.hideQrOnMobile}
          showCashback={props.showCashback}
        />
      </Show>
    </div>
  );
};
