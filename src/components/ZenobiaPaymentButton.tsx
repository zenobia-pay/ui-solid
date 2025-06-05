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

  const handleClick = async () => {
    try {
      setLoading(true);
      setAnimationState(AnimationState.BUTTON_CLOSING);

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

      // Start QR code expansion animation
      setAnimationState(AnimationState.QR_EXPANDING);

      // Add a small delay for the animation
      setTimeout(() => {
        setAnimationState(AnimationState.QR_VISIBLE);
        setLoading(false);
      }, 500);
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
            z-index: 3;
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
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            padding: 16px;
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
            padding: 24px; /* Increased padding for popup */
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            position: relative; /* For close button positioning */
            width: auto; /* Auto width based on content */
            max-width: 90%; /* Max width to prevent overflow */
          }


          .zenobia-qr-close {
            position: absolute;
            top: 12px;
            right: 12px;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background-color: #f3f4f6;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
          }

          .zenobia-qr-close:hover {
            background-color: #e5e7eb;
          }

          .zenobia-qr-close svg {
            width: 12px;
            height: 12px;
            stroke: #4b5563;
          }

          .zenobia-qr-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 140px;
            background-color: white;
          }

          .zenobia-qr-spinner {
            width: 24px;
            height: 24px;
            border: 2px solid #d1d5db;
            border-top-color: black;
            border-radius: 50%;
            animation: spin 1s linear infinite;
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
        disabled={loading() || animationState() !== AnimationState.INITIAL}
      >
        {loading()
          ? "Loading..."
          : props.buttonText + "hey" || `Pay ${props.amount}`}
      </button>

      {/* QR Code Tooltip/Popup Logic */}
      <Show
        when={
          !isIOS() &&
          (animationState() === AnimationState.QR_EXPANDING ||
            animationState() === AnimationState.QR_VISIBLE)
        }
      >
        {(props.qrPosition || QrPosition.BELOW) !== QrPosition.POPUP ? (
          // Tooltip for ABOVE and BELOW
          <div
            class={`zenobia-qr-tooltip ${
              animationState() === AnimationState.QR_EXPANDING
                ? "expanding"
                : ""
            } ${
              (props.qrPosition || QrPosition.BELOW) === QrPosition.ABOVE
                ? "above"
                : "below"
            }`}
          >
            <div class="zenobia-qr-caret" />
            <div class="zenobia-qr-content">
              {/* Common QR Content */}
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
              <div style="text-align: center;">
                <Show
                  when={qrCodeDataUrl()}
                  fallback={
                    <div class="zenobia-qr-loading">
                      <div class="zenobia-qr-spinner" />
                    </div>
                  }
                >
                  <div style="display: flex; justify-content: center;">
                    <img
                      src={qrCodeDataUrl() || ""}
                      alt="Transfer QR Code"
                      class="zenobia-qr-image"
                    />
                  </div>
                </Show>
                <Show
                  when={error()}
                  fallback={
                    <p class="zenobia-qr-instructions">
                      Point your iPhone camera to pay
                    </p>
                  }
                >
                  <div class="zenobia-error">{error()}</div>
                </Show>
              </div>
            </div>
          </div>
        ) : (
          // Popup
          <div
            class={`zenobia-qr-popup-overlay ${
              animationState() === AnimationState.QR_VISIBLE ? "visible" : ""
            }`}
          >
            <div class="zenobia-qr-popup-content">
              {/* Common QR Content (Copied here, consider refactoring to a sub-component later if complex) */}
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
              <div style="text-align: center;">
                <Show
                  when={qrCodeDataUrl()}
                  fallback={
                    <div class="zenobia-qr-loading">
                      <div class="zenobia-qr-spinner" />
                    </div>
                  }
                >
                  <div style="display: flex; justify-content: center;">
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
                <Show
                  when={error()}
                  fallback={
                    <p class="zenobia-qr-instructions">
                      Point your iPhone camera to pay
                    </p>
                  }
                >
                  <div class="zenobia-error">{error()}</div>
                </Show>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};
