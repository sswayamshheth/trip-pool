import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, Card, Icon, Screen, TextField, TextLink } from "@/components/kit";
import { colors, radius, space, type } from "@/constants/design";
import { useFeedback, useOnce } from "@/lib/feedback";
import { useStore } from "@/lib/ledger/store";

/**
 * Prototype sign-in. There is no SMS backend: the app generates a six-digit
 * code, shows it on screen, and checks what you type against it. That is
 * enough to demonstrate the flow honestly without pretending an OTP was sent.
 */
const DEMO_PHONE = "98200 11223";

export default function LoginScreen() {
  const router = useRouter();
  const store = useStore();
  const { toast } = useFeedback();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [entered, setEntered] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const startCountdown = () => {
    setSecondsLeft(30);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1 && timer.current) clearInterval(timer.current);
        return Math.max(0, s - 1);
      });
    }, 1000);
  };

  const digits = phone.replace(/\D/g, "");
  const phoneValid = /^[6-9]\d{9}$/.test(digits);

  const sendCode = useOnce(() => {
    if (!phoneValid) {
      setError("Enter a 10-digit Indian mobile number");
      return;
    }
    setError(undefined);
    const generated = String(Math.floor(100000 + Math.random() * 900000));
    setCode(generated);
    setEntered("");
    setStep("otp");
    startCountdown();
    toast("Verification code generated below", "info");
  });

  const verify = useOnce(() => {
    if (entered.replace(/\D/g, "") !== code) {
      setError("That code doesn't match. Check the digits below.");
      return;
    }
    setError(undefined);
    store.signIn({ phone: `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`, name: name.trim() || "You" });
    toast("Signed in", "success");
    router.replace("/(home)/trips");
  });

  return (
    <Screen
      contentStyle={{ paddingTop: 24 }}
      footer={
        step === "phone" ? (
          <Button label="Continue" icon="arrow-forward" full onPress={sendCode} disabled={!phoneValid} />
        ) : (
          <Button label="Verify & continue" icon="check" full onPress={verify} disabled={entered.replace(/\D/g, "").length !== 6} />
        )
      }
    >
      <View style={styles.brand}>
        <View style={styles.mark}>
          <Icon name="route" size={26} color={colors.white} />
        </View>
        <Text style={type.display}>GroupTrip Ledger</Text>
        <Text style={[type.bodyMuted, { maxWidth: 340 }]}>
          Plan the trip, and the money follows. Shares, refunds and settlements all derive from who is on each booking.
        </Text>
      </View>

      {step === "phone" ? (
        <Card style={{ gap: 16 }}>
          <TextField
            label="Mobile number"
            value={phone}
            onChangeText={(v) => {
              setPhone(v.replace(/[^\d\s]/g, "").slice(0, 12));
              setError(undefined);
            }}
            placeholder="98765 43210"
            prefix="+91"
            keyboardType="phone-pad"
            inputMode="tel"
            autoFocus
            error={error}
            hint="No signup form and no KYC — joining a trip is a link tap."
          />
          <TextField label="Your name (optional)" value={name} onChangeText={setName} placeholder="So your group recognises you" autoCapitalize="words" maxLength={40} />
          <TextLink label={`Use the demo number ${DEMO_PHONE}`} icon="bolt" onPress={() => setPhone(DEMO_PHONE)} />
        </Card>
      ) : (
        <Card style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <Text style={type.heading}>Enter the 6-digit code</Text>
            <Text style={type.small}>
              Sent to +91 {digits.slice(0, 5)} {digits.slice(5)} ·{" "}
              <Text style={{ color: colors.blue, fontWeight: "700" }} onPress={() => setStep("phone")}>
                change
              </Text>
            </Text>
          </View>
          <TextField
            label="Verification code"
            value={entered}
            onChangeText={(v) => {
              setEntered(v.replace(/\D/g, "").slice(0, 6));
              setError(undefined);
            }}
            placeholder="000000"
            keyboardType="number-pad"
            inputMode="numeric"
            autoFocus
            error={error}
          />
          <View style={styles.codeBox}>
            <Icon name="info-outline" size={18} color={colors.amberText} />
            <View style={{ flex: 1 }}>
              <Text style={[type.small, { color: colors.amberText, fontWeight: "700" }]}>Prototype — no SMS is sent</Text>
              <Text style={[type.small, { color: colors.amberText }]}>
                Your code is <Text style={{ fontWeight: "800", letterSpacing: 2 }}>{code}</Text>
              </Text>
            </View>
            <Button label="Fill" small variant="secondary" onPress={() => setEntered(code)} accessibilityLabel="Fill the demo code" />
          </View>
          <TextLink label={secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Resend code"} icon="refresh" onPress={() => (secondsLeft > 0 ? undefined : sendCode())} />
        </Card>
      )}

      <Text style={[type.caption, { textAlign: "center", marginTop: 4 }]}>
        A prototype. It never moves real money — payments hand off to your own UPI app.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", gap: 10, marginBottom: space.lg, paddingHorizontal: 12 },
  mark: { width: 62, height: 62, borderRadius: 20, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  codeBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.amber, borderRadius: radius.md, padding: 12 },
});
