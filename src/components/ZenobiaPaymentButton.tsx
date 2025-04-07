import { createSignal, Component, createEffect, Show } from "solid-js";
import { ZenobiaClient, StatementItem } from "@zenobia/client";
import QRCode from "qrcode";

export interface CreateTransferRequestResponse {
  transferRequestId: string;
  merchantId: string;
}

// Define the TransferStatus enum
export enum TransferStatus {
  PENDING = "PENDING",
  IN_FLIGHT = "IN_FLIGHT",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
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

export const ZenobiaPaymentButton: Component<ZenobiaPaymentButtonProps> = (
  props
) => {
  const [loading, setLoading] = createSignal<boolean>(false);
  const [showQR, setShowQR] = createSignal<boolean>(false);
  const [transferRequest, setTransferRequest] =
    createSignal<CreateTransferRequestResponse | null>(null);
  const [qrCodeSvg, setQrCodeSvg] = createSignal<string | null>(null);
  const [transferStatus, setTransferStatus] = createSignal<TransferStatus>(
    TransferStatus.PENDING
  );
  const [error, setError] = createSignal<string | null>(null);

  let qrCanvasRef: HTMLCanvasElement | undefined;

  // Generate QR code
  createEffect(() => {
    const request = transferRequest();
    if (request?.transferRequestId && request?.merchantId) {
      const qrData = JSON.stringify({
        transferRequestId: request.transferRequestId,
        merchantId: request.merchantId,
        amount: props.amount,
        status: transferStatus(),
      });

      // Create a simple QR code with standard colors
      QRCode.toCanvas(qrCanvasRef, qrData, {
        errorCorrectionLevel: "H", // High error correction
        margin: 2, // Standard margin
        width: props.qrCodeSize || 200,
        color: {
          dark: "#000000", // Black
          light: "#FFFFFF", // White background
        },
      }).catch((err) => {
        console.error("Error generating QR code:", err);
        setError("Failed to generate QR code");
      });
    }
  });

  // Function to update the transfer status - can be called when webhook data is received
  const updateTransferStatus = (status: string) => {
    // Convert API status to our enum
    let currentStatus: TransferStatus;
    switch (status) {
      case "COMPLETED":
        currentStatus = TransferStatus.COMPLETED;
        break;
      case "FAILED":
        currentStatus = TransferStatus.FAILED;
        break;
      case "CANCELLED":
        currentStatus = TransferStatus.CANCELLED;
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
      // Initialize client with no parameters as per the updated implementation
      const client = new ZenobiaClient();

      // Create default statement item if none provided
      const statementItems = props.statementItems || [
        {
          name: "Payment",
          amount: props.amount,
        },
      ];

      // Call createTransferRequest with the full URL
      const transfer = (await client.createTransferRequest(
        props.url,
        props.amount,
        statementItems
      )) as unknown as {
        transferRequestId: string;
        merchantId: string;
      };

      // Store transfer request data
      setTransferRequest({
        transferRequestId: transfer.transferRequestId,
        merchantId: transfer.merchantId,
      });

      setShowQR(true);
      setLoading(false);

      if (props.onSuccess) {
        props.onSuccess({
          transferRequestId: transfer.transferRequestId,
          merchantId: transfer.merchantId,
        });
      }
    } catch (error) {
      setLoading(false);
      setError(error instanceof Error ? error.message : "An error occurred");

      if (props.onError && error instanceof Error) {
        props.onError(error);
      }
    }
  };

  return (
    <Show
      when={!showQR()}
      fallback={
        <div class="flex flex-col items-center">
          <Show
            when={transferRequest()}
            fallback={
              <div class="w-48 h-48 flex items-center justify-center">
                <span class="loading">Generating QR code...</span>
              </div>
            }
          >
            <div class="card bg-base-100 shadow-sm">
              <div class="card-body p-4 items-center">
                {/* Simple QR Code */}
                <div
                  style={{
                    width: `${props.qrCodeSize || 200}px`,
                    height: `${props.qrCodeSize || 200}px`,
                    margin: "10px 0",
                  }}
                >
                  <canvas
                    ref={qrCanvasRef}
                    style={{
                      width: "100%",
                      height: "100%",
                    }}
                  />
                </div>

                <p class="text-xs opacity-70 text-center mt-2">
                  Scan to verify transfer details
                </p>
                <div class="mt-3">
                  <div class={`badge ${getBadgeClass()} gap-2`}>
                    <span>Status: {transferStatus() || "Waiting"}</span>
                  </div>
                </div>
              </div>
            </div>
          </Show>
          <Show when={error()}>
            <div class="mt-2 text-xs text-error">{error()}</div>
          </Show>
        </div>
      }
    >
      <button
        class={`zenobia-payment-button ${props.buttonClass || ""}`}
        onClick={handleClick}
        disabled={loading()}
      >
        {loading()
          ? "Processing..."
          : props.buttonText || `Pay ${props.amount}`}
      </button>
    </Show>
  );
};
