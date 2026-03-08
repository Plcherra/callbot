/// User-facing error and feedback messages.
/// Use these instead of raw exception strings for SnackBars and dialogs.
class AppStrings {
  AppStrings._();

  // Billing & payments
  static const couldNotOpenBilling =
      "Couldn't open billing portal. Please try again.";
  static const billingError = "Billing error. Please try again later.";

  // Calendar
  static const couldNotConnectCalendar =
      "Couldn't connect calendar. Please try again.";

  // General
  static const somethingWentWrong = "Something went wrong. Please try again.";
  static const couldNotComplete = "Couldn't complete. Please try again.";

  // Receptionist
  static const couldNotDeleteReceptionist =
      "Couldn't delete receptionist. Please try again.";
  static const couldNotSaveSettings = "Couldn't save. Please try again.";
  static const callInitiated = "Call initiated";
  static const couldNotStartCall = "Couldn't start call. Please try again.";
  static const couldNotFetchWebsite = "Couldn't fetch website. Please try again.";
}
