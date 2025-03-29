import { createSignal, Component } from "solid-js";
import { ZenobiaClient, StatementItem } from "@zenobia/client";

export interface CreateTransferRequestResponse {
  transferRequestId: string;
  merchantId: string;
}

interface ZenobiaPaymentButtonProps {
  amount: number;
  url: string; // Full URL to the payment endpoint
  statementItems?: StatementItem[]; // Optional statement items
  buttonText?: string;
  buttonClass?: string;
  onSuccess?: (response: CreateTransferRequestResponse) => void;
  onError?: (error: Error) => void;
}

export const ZenobiaPaymentButton: Component<ZenobiaPaymentButtonProps> = (
  props
) => {
  const [loading, setLoading] = createSignal<boolean>(false);

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
      const transferId = await client.createTransferRequest(
        props.url,
        props.amount,
        statementItems
      );

      setLoading(false);

      if (props.onSuccess) {
        // The actual response would come from the merchant's backend
        // This is a placeholder until we get the actual response structure
        props.onSuccess({
          transferRequestId: String(transferId),
          merchantId: "merchant-id", // This would normally come from the response
        });
      }
    } catch (error) {
      setLoading(false);

      if (props.onError && error instanceof Error) {
        props.onError(error);
      }
    }
  };

  return (
    <button
      class={`zenobia-payment-button ${props.buttonClass || ""}`}
      onClick={handleClick}
      disabled={loading()}
    >
      {loading() ? "Processing..." : props.buttonText || `Pay ${props.amount}`}
    </button>
  );
};
