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
    <div class="relative w-[240px]">
      {/* Payment Button */}
      <button
        class={`w-full h-[120px] zenobia-payment-button rounded-lg px-6 py-3 transition-all duration-300 ${
          animationState() !== AnimationState.INITIAL
            ? "bg-gray-800 text-white cursor-not-allowed"
            : props.buttonClass || "bg-black text-white hover:bg-gray-800"
        }`}
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

      {/* QR Code Tooltip */}
      <Show
        when={
          animationState() === AnimationState.QR_EXPANDING ||
          animationState() === AnimationState.QR_VISIBLE
        }
      >
        <div
          class={`absolute left-0 right-0 mt-2 transform transition-all duration-300 ${
            animationState() === AnimationState.QR_EXPANDING
              ? "opacity-0 translate-y-2"
              : "opacity-100 translate-y-0"
          }`}
        >
          {/* Caret */}
          <div class="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45 bg-white border-t border-l border-gray-200" />

          {/* Content Container */}
          <div class="relative bg-white rounded-xl border border-gray-200 shadow-lg p-4">
            <div class="text-center">
              <Show
                when={qrCodeDataUrl()}
                fallback={
                  <div class="flex items-center justify-center w-full h-[140px]">
                    <div class="w-6 h-6 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
                  </div>
                }
              >
                <div class="flex justify-center">
                  <img
                    src={qrCodeDataUrl() || ""}
                    alt="Transfer QR Code"
                    class="w-[140px] h-[140px] object-contain"
                  />
                </div>
              </Show>
              <Show
                when={error()}
                fallback={
                  <p class="text-sm text-gray-600 mb-3">
                    Point your iPhone camera to pay
                  </p>
                }
              >
                <div class="text-red-500 text-xs mt-3">{error()}</div>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
