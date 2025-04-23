import {
  createSignal,
  Component,
  createEffect,
  onCleanup,
  Show,
} from "solid-js";
import { ZenobiaClient } from "@zenobia/client";
import QRCode from "qrcode";

// Import or define the StatementItem interface to match the client
export interface StatementItem {
  name: string;
  amount: number;
}

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

// Define interface for client TransferStatus
interface ClientTransferStatus {
  status: string;
  [key: string]: any;
}

interface ZenobiaPaymentButtonProps {
  amount: number;
  url: string; // Full URL to the payment endpoint
  statementItems?: StatementItem[]; // Optional statement items
  buttonText?: string;
  buttonClass?: string;
  qrCodeSize?: number;
  onSuccess?: (response: CreateTransferRequestResponse) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: TransferStatus) => void;
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
      // Convert to base64URL format (no padding)
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
        // On iOS, open the App Clip directly
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
        currentStatus = TransferStatus.COMPLETED;
        // Call onSuccess callback with the transfer request data
        if (props.onSuccess && transferRequest()) {
          props.onSuccess(transferRequest()!);
        }
        // Disconnect the WebSocket client
        const client = zenobiaClient();
        if (client) {
          client.disconnect();
          setZenobiaClient(null);
        }
        break;
      case "FAILED":
        currentStatus = TransferStatus.FAILED;
        // Disconnect the WebSocket client
        const failedClient = zenobiaClient();
        if (failedClient) {
          failedClient.disconnect();
          setZenobiaClient(null);
        }
        break;
      case "CANCELLED":
        currentStatus = TransferStatus.CANCELLED;
        // Disconnect the WebSocket client
        const cancelledClient = zenobiaClient();
        if (cancelledClient) {
          cancelledClient.disconnect();
          setZenobiaClient(null);
        }
        break;
      case "IN_FLIGHT":
        currentStatus = TransferStatus.IN_FLIGHT;
        break;
      default:
        currentStatus = TransferStatus.PENDING;
    }

    setTransferStatus(currentStatus);

    // Call the onStatusChange callback if provided
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

      // Initialize client
      const client = new ZenobiaClient();
      setZenobiaClient(client);

      // Create default statement item if none provided
      const statementItems = props.statementItems || [
        {
          name: "Payment",
          amount: props.amount,
        },
      ];

      // Call createTransferAndListen with the full URL and callbacks
      const transfer = await client.createTransferAndListen(
        props.url,
        props.amount,
        statementItems,
        handleStatusUpdate,
        handleWebSocketError,
        handleConnectionChange
      );

      // Store transfer request data
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
            margin-top: 8px;
            transform: translateY(0);
            opacity: 1;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 3;
          }

          .zenobia-qr-tooltip.expanding {
            opacity: 0;
            transform: translateY(8px);
          }

          .zenobia-qr-caret {
            position: absolute;
            top: -8px;
            left: 50%;
            transform: translateX(-50%) rotate(45deg);
            width: 16px;
            height: 16px;
            background-color: white;
            border-top: 1px solid #e5e7eb;
            border-left: 1px solid #e5e7eb;
            z-index: 4;
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
          ? "Processing..."
          : props.buttonText || `Pay ${props.amount}`}
      </button>

      {/* QR Code Tooltip - Only show if not on iOS */}
      <Show
        when={
          !isIOS() &&
          (animationState() === AnimationState.QR_EXPANDING ||
            animationState() === AnimationState.QR_VISIBLE)
        }
      >
        <div
          class={`zenobia-qr-tooltip ${
            animationState() === AnimationState.QR_EXPANDING ? "expanding" : ""
          }`}
        >
          {/* Caret */}
          <div class="zenobia-qr-caret" />

          {/* Content Container */}
          <div class="zenobia-qr-content">
            {/* Close Button */}
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
      </Show>
    </div>
  );
};
