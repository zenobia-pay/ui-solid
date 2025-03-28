import { createSignal, Component } from "solid-js";
import { ZenobiaClient } from "@zenobia/client";

interface ZenobiaPaymentButtonProps {
  amount: number;
  currency: string;
  description?: string;
  buttonText?: string;
  buttonClass?: string;
  onSuccess?: (payment: { id: number }) => void;
  onError?: (error: Error) => void;
}

export const ZenobiaPaymentButton: Component<ZenobiaPaymentButtonProps> = (
  props
) => {
  const [loading, setLoading] = createSignal<boolean>(false);

  const handleClick = async () => {
    try {
      setLoading(true);
      // Initialize client with default parameters as per the implementation
      const client = new ZenobiaClient("test_key", "https://api.zenobia.pay");

      // Call createPayment with the correct parameters
      const paymentId = await client.createPayment(
        props.amount,
        props.currency,
        props.description || `Payment of ${props.amount} ${props.currency}`
      );

      setLoading(false);

      if (props.onSuccess) {
        props.onSuccess({ id: paymentId });
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
      {loading()
        ? "Processing..."
        : props.buttonText || `Pay ${props.amount} ${props.currency}`}
    </button>
  );
};
