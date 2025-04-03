import {
  createSignal,
  Component,
  createEffect,
  onCleanup,
  Show,
} from "solid-js";
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
  pollingInterval?: number;
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
  const [qrCodeDataUrl, setQrCodeDataUrl] = createSignal<string | null>(null);
  const [transferStatus, setTransferStatus] = createSignal<TransferStatus>(
    TransferStatus.PENDING
  );
  const [error, setError] = createSignal<string | null>(null);
  const [isPolling, setIsPolling] = createSignal(false);
  const [pollingIntervalId, setPollingIntervalId] = createSignal<number | null>(
    null
  );

  // Generate QR code when transfer request is created
  createEffect(() => {
    const request = transferRequest();
    if (request?.transferRequestId && request?.merchantId) {
      const qrData = {
        transferRequestId: request.transferRequestId,
        merchantId: request.merchantId,
        amount: props.amount,
        status: transferStatus(),
      };

      QRCode.toDataURL(JSON.stringify(qrData), {
        errorCorrectionLevel: "H",
        margin: 1,
        width: props.qrCodeSize || 200,
      })
        .then((url) => {
          setQrCodeDataUrl(url);
          // Start polling for transfer status updates
          startPollingTransferStatus(request.transferRequestId);
        })
        .catch((err) => {
          console.error("Error generating QR code:", err);
          setError("Failed to generate QR code");
        });
    }
  });

  // Start polling for transfer status updates
  const startPollingTransferStatus = (transferRequestId: string) => {
    if (isPolling()) return; // Prevent multiple polling instances

    setIsPolling(true);

    const intervalId = window.setInterval(async () => {
      try {
        // Direct API call to get transfer status since ZenobiaClient doesn't have this method
        const statusUrl = `https://api.zenobiapay.com/transfers/${transferRequestId}/status`;
        const response = await fetch(statusUrl);

        if (!response.ok) {
          throw new Error(
            `Error polling transfer status: ${response.statusText}`
          );
        }

        const { status } = await response.json();

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

        // Stop polling if transfer is in a terminal state
        if (
          currentStatus === TransferStatus.COMPLETED ||
          currentStatus === TransferStatus.FAILED ||
          currentStatus === TransferStatus.CANCELLED
        ) {
          stopPollingTransferStatus();
        }
      } catch (err) {
        console.error("Error polling transfer status:", err);
        // Don't stop polling on error, just log it
      }
    }, props.pollingInterval || 5000); // Default to 5 seconds if not specified

    setPollingIntervalId(intervalId);
  };

  // Stop polling
  const stopPollingTransferStatus = () => {
    if (pollingIntervalId()) {
      window.clearInterval(pollingIntervalId()!);
      setPollingIntervalId(null);
    }
    setIsPolling(false);
  };

  // Cleanup on component unmount
  onCleanup(() => {
    stopPollingTransferStatus();
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
            when={qrCodeDataUrl()}
            fallback={
              <div class="w-48 h-48 flex items-center justify-center">
                <span class="loading">Loading QR code...</span>
              </div>
            }
          >
            <div class="card bg-base-100 shadow-sm">
              <div class="card-body p-4 items-center">
                <img
                  src={qrCodeDataUrl() || ""}
                  alt="Transfer QR Code"
                  class="w-48 h-48"
                />
                <p class="text-xs opacity-70 text-center mt-2">
                  Scan to verify transfer details
                </p>
                <div class="mt-3">
                  <div class={`badge ${getBadgeClass()} gap-2`}>
                    {isPolling() &&
                    transferStatus() !== TransferStatus.COMPLETED &&
                    transferStatus() !== TransferStatus.FAILED &&
                    transferStatus() !== TransferStatus.CANCELLED ? (
                      <span class="flex items-center">
                        <span class="loading loading-spinner loading-xs"></span>
                        Status: {transferStatus() || "Waiting"}
                      </span>
                    ) : (
                      <span>Status: {transferStatus() || "Waiting"}</span>
                    )}
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
