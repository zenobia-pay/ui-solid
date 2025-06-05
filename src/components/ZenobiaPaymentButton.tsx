import {
  createSignal,
  Component,
  createEffect,
  onCleanup,
  Show,
} from "solid-js";
import { ZenobiaClient } from "@zenobia/client";
import QRCode from "qrcode";

export interface CreateTransferRequestResponse {
  transferRequestId: string;
  merchantId: string;
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
  buttonClass?: string;
  qrCodeSize?: number;
  discountAmount?: number; // discount amount in cents
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
  const [loading, setLoading] = createSignal<boolean>(false);
  const [animationState, setAnimationState] = createSignal<AnimationState>(
    AnimationState.INITIAL
  );
  const [transferRequest, setTransferRequest] =
    createSignal<CreateTransferRequestResponse | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = createSignal<string | null>(null);
  const [transferStatus, setTransferStatus] = createSignal<TransferStatus>(
    TransferStatus.PENDING
  );
  const [error, setError] = createSignal<string | null>(null);
  const [isConnected, setIsConnected] = createSignal(false);
  const [zenobiaClient, setZenobiaClient] = createSignal<ZenobiaClient | null>(
    null
  );

  // Generate QR code when transfer request is created
  createEffect(() => {
    const request = transferRequest();
    if (request?.transferRequestId && request?.merchantId) {
      const transferIdNoDashes = request.transferRequestId.replace(/-/g, "");
      const base64TransferId = btoa(transferIdNoDashes)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const qrString = `https://zenobiapay.com/clip?id=${base64TransferId}`;

      console.log("Transfer ID:", request.transferRequestId);
      console.log("Base64 Transfer ID:", qrString);

      // Only generate QR code if not on iOS
      if (!isIOS()) {
        QRCode.toDataURL(qrString, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: props.qrCodeSize || 200,
        })
          .then((url) => {
            setQrCodeDataUrl(url);
          })
          .catch((err) => {
            console.error("Error generating QR code:", err);
            setError("Failed to generate QR code");
          });
      } else {
        // On iOS, open the App Clip / App directly
        window.location.href = qrString;
      }
    }
  });

  // Handle WebSocket status update
  const handleStatusUpdate = (status: ClientTransferStatus) => {
    console.log("Received status update:", status);

    // Convert API status to our enum
    let currentStatus: TransferStatus;
    switch (status.status) {
      case "COMPLETED":
      case "IN_FLIGHT":
        currentStatus = TransferStatus.COMPLETED;
        if (props.onSuccess && transferRequest()) {
          props.onSuccess(transferRequest()!, status);
        }
        const client = zenobiaClient();
        if (client) {
          client.disconnect();
          setZenobiaClient(null);
        }
        break;
      case "FAILED":
        currentStatus = TransferStatus.FAILED;
        const failedClient = zenobiaClient();
        if (failedClient) {
          failedClient.disconnect();
          setZenobiaClient(null);
        }
        break;
      case "CANCELLED":
        currentStatus = TransferStatus.CANCELLED;
        const cancelledClient = zenobiaClient();
        if (cancelledClient) {
          cancelledClient.disconnect();
          setZenobiaClient(null);
        }
        break;
      default:
        currentStatus = TransferStatus.PENDING;
    }

    setTransferStatus(currentStatus);

    if (props.onStatusChange) {
      props.onStatusChange(currentStatus);
    }
  };

  // Handle WebSocket error
  const handleWebSocketError = (errorMsg: string) => {
    console.error("WebSocket error:", errorMsg);
    setError(errorMsg);
  };

  // Handle WebSocket connection status change
  const handleConnectionChange = (connected: boolean) => {
    console.log(
      "WebSocket connection status:",
      connected ? "Connected" : "Disconnected"
    );
    setIsConnected(connected);
  };

  // Cleanup on component unmount
  onCleanup(() => {
    const client = zenobiaClient();
    if (client) {
      client.disconnect();
    }
  });

  // Function to get badge color based on status
  const getBadgeClass = () => {
    switch (transferStatus()) {
      case TransferStatus.COMPLETED:
        return "badge-success";
      case TransferStatus.FAILED:
      case TransferStatus.CANCELLED:
        return "badge-error";
      case TransferStatus.IN_FLIGHT:
        return "badge-info";
      default:
        return "badge-ghost";
    }
  };

  // Calculate discount amount or default to amount/100 if not provided
  const discountAmount = () =>
    props.discountAmount !== undefined
      ? props.discountAmount
      : Math.round(props.amount / 100);

  // Format cashback message based on amount
  const cashbackMessage = () => {
    const discount = discountAmount();
    if (discount < 1000) { // Less than $10 (in cents)
      const percentage = ((discount / props.amount) * 100).toFixed(0);
      return `✨ ${percentage}% cashback applied! ✨`;
    } else {
      return `✨ Applied $${(discount / 100).toFixed(2)} cashback!`;
    }
  };

  const handleClick = async () => {
    if (loading()) return;
    setLoading(true);
    setError(null);

    try {
      // Show QR screen immediately with placeholder
      setAnimationState(AnimationState.QR_EXPANDING);
      
      // Add a small delay for the animation
      setTimeout(() => {
        setAnimationState(AnimationState.QR_VISIBLE);
      }, 300);

      // Create a new transfer request in parallel
      const client = new ZenobiaClient();
      setZenobiaClient(client);

      const metadata = props.metadata || {
        amount: props.amount,
        statementItems: {
          name: "Payment",
          amount: props.amount,
        },
      };

      const transfer = await client.createTransferAndListen(
        props.url,
        metadata,
        handleStatusUpdate,
        handleWebSocketError,
        handleConnectionChange
      );

      setTransferRequest({
        transferRequestId: transfer.transferRequestId,
        merchantId: transfer.merchantId,
        expiry: transfer.expiry,
        signature: transfer.signature,
      });
      
      setLoading(false);
    } catch (error) {
      setLoading(false);
      setAnimationState(AnimationState.INITIAL);
      setError(error instanceof Error ? error.message : "An error occurred");

      if (props.onError && error instanceof Error) {
        props.onError(error);
      }
    }
  };

  return (
    <div class="zenobia-payment-container">
      <style>
        {`
          .zenobia-payment-container {
            position: relative;
            width: 240px;
            z-index: 1;
          }
          
          .zenobia-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
          }
          
          .zenobia-modal-overlay.visible {
            opacity: 1;
          }

          .zenobia-payment-button {
            width: 100%;
            height: 48px;
            border-radius: 24px;
            padding: 0 24px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            font-size: 16px;
            font-weight: 500;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            position: relative;
            z-index: 2;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }

          .zenobia-payment-button:disabled {
            cursor: not-allowed;
            background-color: #e5e7eb;
            color: #9ca3af;
            box-shadow: none;
            transform: none;
          }

          .zenobia-payment-button:not(:disabled) {
            background-color: black;
            color: white;
          }

          .zenobia-payment-button:not(:disabled):hover {
            background-color: #222222;
            transform: translateY(-2px);
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }

          .zenobia-payment-button:not(:disabled):active {
            transform: translateY(0);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }

          .zenobia-qr-tooltip {
            position: absolute;
            left: 0;
            right: 0;
            /* margin-top: 8px; */ /* Removed for dynamic positioning */
            transform: translateY(0);
            opacity: 1;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 1001;
          }
          
          .zenobia-qr-tooltip.visible {
            transform: scale(1);
            opacity: 1;
          }

          .zenobia-qr-tooltip.below {
            margin-top: 8px;
          }
          .zenobia-qr-tooltip.above {
            bottom: 100%;
            margin-bottom: 8px;
          }

          .zenobia-qr-tooltip.expanding {
            opacity: 0;
            transform: translateY(8px);
          }
          .zenobia-qr-tooltip.above.expanding {
            transform: translateY(-8px);
          }


          .zenobia-qr-caret {
            position: absolute;
            /* top: -8px; */ /* Removed for dynamic positioning */
            left: 50%;
            transform: translateX(-50%) rotate(45deg);
            width: 16px;
            height: 16px;
            background-color: white;
            border-top: 1px solid #e5e7eb;
            border-left: 1px solid #e5e7eb;
            z-index: 4;
          }

          .zenobia-qr-tooltip.below .zenobia-qr-caret {
            top: -8px;
            border-top: 1px solid #e5e7eb;
            border-left: 1px solid #e5e7eb;
            border-bottom: none;
            border-right: none;
          }

          .zenobia-qr-tooltip.above .zenobia-qr-caret {
            bottom: -8px;
            border-bottom: 1px solid #e5e7eb;
            border-right: 1px solid #e5e7eb;
            border-top: none;
            border-left: none;
          }


          .zenobia-qr-content {
            position: relative;
            background-color: white;
            border-radius: 16px;
            border: 1px solid #e5e7eb;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            padding: 24px;
            z-index: 3;
          }

          /* Styles for Popup */
          .zenobia-qr-popup-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999;
            opacity: 0;
            transition: opacity 0.3s ease;
          }
          .zenobia-qr-popup-overlay.visible {
            opacity: 1;
          }
          .zenobia-qr-popup-content {
            background-color: white;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            position: relative;
            width: 300px;
            max-width: 90%;
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 16px 8px 12px;
            position: relative;
            background: #ffffff;
            border-bottom: 1px solid #f0f0f0;
          }
          
          .modal-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #333;
          }
          
          .subtitle {
            margin: 4px 0 0;
            font-size: 12px;
            color: #666;
          }
          
          .loading-spinner {
            display: flex;
            align-items: center;
          }
          
          .spinner {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(0, 0, 0, 0.1);
            border-radius: 50%;
            border-top-color: #333;
            animation: spin 0.8s linear infinite;
            flex-shrink: 0;
            display: inline-block;
            margin-right: 8px;
            position: relative;
          }
          
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }

          .modal-body {
            text-align: center;
          }

          .qr-code-container {
            margin: 0 auto;
            padding: 8px;
            background: white;
            border-radius: 8px;
            display: inline-block;
          }
          
          .payment-amount {
            font-size: 32px;
            font-weight: 600;
            margin: 8px 0 8px;
            color: #333;
          }
          
          .payment-status {
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 12px auto 0;
            width: 100%;
          }

          .savings-badge {
            display: block;
            background-color: #f0fdf4;
            color: #065f46;
            font-size: 12px;
            font-weight: 500;
            padding: 4px 12px;
            border-radius: 12px;
            margin: 4px auto 12px;
            border: 1px solid #bbf7d0;
            width: fit-content;
          }

          .payment-instructions {
            font-size: 14px;
            color: #666;
            margin-bottom: auto;
            margin-top: auto;
          }

          .zenobia-qr-close {
            position: absolute;
            right: 12px;
            top: 12px;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background-color: #f0f0f0;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            transition: all 0.2s ease;
            z-index: 10;
          }

          .zenobia-qr-close:hover {
            background-color: #e0e0e0;
          }

          .zenobia-qr-close svg {
            width: 12px;
            height: 12px;
            stroke: #4b5563;
          }

          .zenobia-qr-placeholder {
            background-color: #e0e0e0;
            border-radius: 8px;
            position: relative;
            overflow: hidden;
          }
          
          .zenobia-qr-placeholder::after {
            content: "";
            position: absolute;
            top: -100%;
            left: -100%;
            width: 200%;
            height: 200%;
            background: linear-gradient(135deg, 
              rgba(255,255,255,0) 0%, 
              rgba(255,255,255,1) 50%, 
              rgba(255,255,255,0) 100%);
            animation: shimmer 0.8s infinite linear;
            box-shadow: 0 0 30px 30px rgba(255,255,255,0.5);
          }
          
          @keyframes shimmer {
            0% {
              transform: translate(0%, 0%);
            }
            100% {
              transform: translate(50%, 50%);
            }
          }
          .zenobia-qr-image {
            width: 140px;
            height: 140px;
            object-fit: contain;
            background-color: white;
          }

          .zenobia-qr-instructions {
            font-size: 14px;
            color: #4b5563;
            margin-bottom: 12px;
            text-align: center;
          }

          .zenobia-error {
            color: #ef4444;
            font-size: 12px;
            margin-top: 12px;
            text-align: center;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>

      {/* Payment Button */}
      <button
        class="zenobia-payment-button"
        style={{
          "background-color":
            animationState() !== AnimationState.INITIAL ? "#222222" : "black",
        }}
        onClick={handleClick}
        disabled={animationState() !== AnimationState.INITIAL}
      >
        {props.buttonText || `Pay ${props.amount}`}
      </button>

      {/* QR Code Tooltip/Popup Logic */}
      <Show
        when={
          !isIOS() &&
          (animationState() === AnimationState.QR_EXPANDING ||
            animationState() === AnimationState.QR_VISIBLE)
        }
      >
        <div 
          class="zenobia-qr-popup-overlay"
          classList={{
            visible: animationState() === AnimationState.QR_VISIBLE,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setAnimationState(AnimationState.INITIAL);
              setTransferRequest(null);
              setQrCodeDataUrl(null);
              setTransferStatus(TransferStatus.PENDING);
              const client = zenobiaClient();
              if (client) {
                client.disconnect();
                setZenobiaClient(null);
              }
            }
          }}
        >
          <div class="zenobia-qr-popup-content">
            <button
              class="zenobia-qr-close"
              onClick={() => {
                setAnimationState(AnimationState.INITIAL);
                setTransferRequest(null);
                setQrCodeDataUrl(null);
                setTransferStatus(TransferStatus.PENDING);
                const client = zenobiaClient();
                if (client) {
                  client.disconnect();
                  setZenobiaClient(null);
                }
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <div class="modal-header">
              <div class="header-content">
                <h3>Pay by bank with Zenobia</h3>
                <p class="subtitle">Scan to complete your purchase</p>
              </div>
            </div>
            <div class="modal-body">
              <Show
                when={qrCodeDataUrl() && transferRequest()}
                fallback={
                  <div class="qr-code-container">
                    <div 
                      class="zenobia-qr-placeholder"
                      style={{
                        width: props.qrCodeSize ? `${props.qrCodeSize}px` : "200px",
                        height: props.qrCodeSize ? `${props.qrCodeSize}px` : "200px"
                      }}
                    />
                  </div>
                }
              >
                <div class="qr-code-container">
                  <img
                    src={qrCodeDataUrl() || ""}
                    alt="Transfer QR Code"
                    class="zenobia-qr-image"
                    style={{
                      width: props.qrCodeSize
                        ? `${props.qrCodeSize}px`
                        : "200px",
                      height: props.qrCodeSize
                        ? `${props.qrCodeSize}px`
                        : "200px",
                    }}
                  />
                </div>
              </Show>
              <div class="payment-amount">
                ${(props.amount / 100).toFixed(2)}
              </div>
              <div class="savings-badge">
                {cashbackMessage()}
              </div>
              <div class="payment-status">
                <div class="spinner"></div>
                <div class="payment-instructions">
                  {!transferRequest() ? "Preparing payment..." : "Waiting for payment"}
                </div>
              </div>
              <Show when={error()}>
                <div class="zenobia-error">{error()}</div>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
