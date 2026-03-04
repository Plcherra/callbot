class Receptionist {
  final String id;
  final String name;
  final String phoneNumber;
  final String? status;
  final String? inboundPhoneNumber;
  final String? calendarId;

  Receptionist({
    required this.id,
    required this.name,
    required this.phoneNumber,
    this.status,
    this.inboundPhoneNumber,
    this.calendarId,
  });

  String get displayPhone => inboundPhoneNumber ?? phoneNumber;

  factory Receptionist.fromJson(Map<String, dynamic> json) {
    return Receptionist(
      id: json['id'] as String,
      name: json['name'] as String,
      phoneNumber: json['phone_number'] as String,
      status: json['status'] as String?,
      inboundPhoneNumber: json['inbound_phone_number'] as String?,
      calendarId: json['calendar_id'] as String?,
    );
  }
}
