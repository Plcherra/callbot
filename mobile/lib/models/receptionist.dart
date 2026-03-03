class Receptionist {
  final String id;
  final String name;
  final String phoneNumber;
  final String? status;

  Receptionist({
    required this.id,
    required this.name,
    required this.phoneNumber,
    this.status,
  });

  factory Receptionist.fromJson(Map<String, dynamic> json) {
    return Receptionist(
      id: json['id'] as String,
      name: json['name'] as String,
      phoneNumber: json['phone_number'] as String,
      status: json['status'] as String?,
    );
  }
}
