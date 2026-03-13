/// Wizard form data for creating a receptionist (matches AddReceptionistWizardModal)
class StaffItem {
  final String name;
  final String description;

  StaffItem({required this.name, required this.description});

  Map<String, dynamic> toJson() =>
      {'name': name, 'description': description};
}

class WizardFormData {
  String name;
  String country;
  String calendarId;
  String phoneStrategy; // 'new' | 'own'
  String? areaCode;
  String? ownPhone;
  String? providerSid;
  String systemPrompt;
  String? greeting;
  String? voiceId;
  String? assistantIdentity;
  List<StaffItem> staff;
  String? promotions;
  String? businessHours;
  String? extraInstructions;
  String? voicePersonality;
  String? fallbackBehavior;
  int? maxCallDurationMinutes;
  bool consent;

  WizardFormData({
    this.name = '',
    this.country = 'US',
    this.calendarId = 'primary',
    this.phoneStrategy = 'new',
    this.areaCode = '212',
    this.ownPhone,
    this.providerSid,
    this.systemPrompt =
        "You are a friendly, professional receptionist for a [business or personal context, e.g. salon, consulting, personal]. Answer calls politely, book appointments into Google Calendar, confirm details, and be helpful. Never be pushy.",
    this.greeting,
    this.voiceId,
    this.assistantIdentity,
    List<StaffItem>? staff,
    this.promotions,
    this.businessHours,
    this.extraInstructions,
    this.voicePersonality = 'friendly',
    this.fallbackBehavior = 'voicemail',
    this.maxCallDurationMinutes,
    this.consent = false,
  }) : staff = staff ?? [];

  Map<String, dynamic> toApiBody() {
    final body = <String, dynamic>{
      'name': name.trim(),
      'country': country,
      'calendar_id': calendarId.trim(),
      'phone_strategy': phoneStrategy,
      'system_prompt': systemPrompt.trim(),
      'staff': staff.where((s) => s.name.trim().isNotEmpty).map((s) => s.toJson()).toList(),
    };
    if (greeting != null && greeting!.trim().isNotEmpty) body['greeting'] = greeting!.trim();
    if (voiceId != null && voiceId!.trim().isNotEmpty) body['voice_id'] = voiceId!.trim();
    if (assistantIdentity != null && assistantIdentity!.trim().isNotEmpty) body['assistant_identity'] = assistantIdentity!.trim();
    if (phoneStrategy == 'new') {
      body['area_code'] = areaCode == 'other' ? '212' : (areaCode ?? '212');
    } else {
      if (ownPhone != null && ownPhone!.trim().isNotEmpty) {
        body['own_phone'] = ownPhone!.trim();
      }
      if (providerSid != null && providerSid!.trim().isNotEmpty) {
        body['provider_sid'] = providerSid!.trim();
      }
    }
    if (promotions != null && promotions!.trim().isNotEmpty) {
      body['promotions'] = promotions!.trim();
    }
    if (extraInstructions != null && extraInstructions!.trim().isNotEmpty) {
      body['extra_instructions'] = extraInstructions!.trim();
    }
    if (businessHours != null && businessHours!.trim().isNotEmpty) {
      body['business_hours'] = businessHours!.trim();
    }
    if (voicePersonality != null) body['voice_personality'] = voicePersonality;
    if (fallbackBehavior != null) body['fallback_behavior'] = fallbackBehavior;
    if (maxCallDurationMinutes != null) {
      body['max_call_duration_minutes'] = maxCallDurationMinutes;
    }
    return body;
  }
}

/// Constants from wizard schemas
class SelectOption {
  final String value;
  final String label;
  const SelectOption(this.value, this.label);
}

const areaCodes = [
  SelectOption('212', '212 (New York)'),
  SelectOption('310', '310 (LA)'),
  SelectOption('415', '415 (San Francisco)'),
  SelectOption('617', '617 (Boston)'),
  SelectOption('646', '646 (New York)'),
  SelectOption('202', '202 (DC)'),
  SelectOption('305', '305 (Miami)'),
  SelectOption('702', '702 (Las Vegas)'),
  SelectOption('other', 'Other'),
];

const countryOptions = [
  SelectOption('US', 'United States'),
  SelectOption('CA', 'Canada'),
  SelectOption('UK', 'United Kingdom'),
  SelectOption('Other', 'Other'),
];

const voicePersonalityOptions = [
  SelectOption('friendly', 'Friendly & Warm'),
  SelectOption('professional', 'Professional & Calm'),
  SelectOption('energetic', 'Energetic'),
  SelectOption('calm', 'Calm & Soothing'),
];

const fallbackBehaviorOptions = [
  SelectOption('voicemail', 'Take voicemail'),
  SelectOption('transfer', 'Transfer to human'),
];
