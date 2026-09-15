import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/**
 * Los clientes (y MySQL) representan los booleanos como 0/1 o "true"/"false".
 * ToBool los normaliza antes de @IsBoolean para que editar un registro existente
 * no falle con 400 al reenviar los valores que devolvió la propia API.
 */
export const ToBool = () => Transform(({ value }) => {
  if (value === undefined || value === null || value === '') return value;
  if (typeof value === 'boolean') return value;
  const v = String(value).toLowerCase().trim();
  if (['1', 'true', 'si', 'sí', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return value;
});

export class LoginDto {
  @IsString() @MaxLength(80) username!: string;
  @IsString() @MinLength(6) @MaxLength(200) password!: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(6) current_password!: string;
  @IsString() @MinLength(10) @MaxLength(200) new_password!: string;
}

export class CreateSiteDto {
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsString() @MinLength(1) @MaxLength(150) name!: string;
  @IsOptional() @IsString() @MaxLength(220) official_name?: string;
  @IsOptional() @IsString() @MaxLength(80) site_type?: string;
  @IsOptional() @IsString() @MaxLength(100) country?: string;
  @IsOptional() @IsString() @MaxLength(100) state?: string;
  @IsOptional() @IsString() @MaxLength(120) municipality?: string;
  @IsOptional() @IsString() @MaxLength(120) locality?: string;
  @IsOptional() @IsString() @MaxLength(150) neighborhood?: string;
  @IsOptional() @IsString() @MaxLength(15) postal_code?: string;
  @IsOptional() @IsString() @MaxLength(180) street?: string;
  @IsOptional() @IsString() @MaxLength(30) exterior_number?: string;
  @IsOptional() @IsString() @MaxLength(30) interior_number?: string;
  @IsOptional() @IsString() @MaxLength(500) reference?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number | null;
  @IsOptional() @IsString() @MaxLength(80) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) manager_name?: string;
  @IsOptional() @IsString() @MaxLength(80) manager_phone?: string;
  @IsOptional() @IsEmail() @MaxLength(160) manager_email?: string;
  @IsOptional() @IsString() @MaxLength(160) technical_contact?: string;
  @IsOptional() @IsString() @MaxLength(80) technical_phone?: string;
  @IsOptional() @IsString() @MaxLength(120) schedule?: string;
  @IsOptional() @IsString() @MaxLength(150) primary_isp?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) primary_bandwidth_mbps?: number | null;
  @IsOptional() @IsString() @MaxLength(150) secondary_isp?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) secondary_bandwidth_mbps?: number | null;
  @IsOptional() @IsIn(['low','medium','high','critical']) criticality?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @ToBool() @IsBoolean() active?: boolean;
}

export class UpdateSiteDto extends CreateSiteDto {
  @IsOptional() declare name: string;
}

export class CreateVlanDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(4094) vlan_id!: number;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsIn(['datos','voz','gestion','camaras','impresion','invitados','servidores','control','otro']) purpose?: string;
  @IsOptional() @IsString() @MaxLength(45) subnet_cidr?: string | null;
  @IsOptional() @IsString() @MaxLength(45) gateway?: string | null;
  @IsOptional() @IsString() @MaxLength(90) dhcp_range?: string | null;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @ToBool() @IsBoolean() active?: boolean;
}

export class UpdateVlanDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4094) vlan_id?: number;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsIn(['datos','voz','gestion','camaras','impresion','invitados','servidores','control','otro']) purpose?: string;
  @IsOptional() @IsString() @MaxLength(45) subnet_cidr?: string | null;
  @IsOptional() @IsString() @MaxLength(45) gateway?: string | null;
  @IsOptional() @IsString() @MaxLength(90) dhcp_range?: string | null;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @ToBool() @IsBoolean() active?: boolean;
}

export class CreateAgentDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(40) agent_code?: string;
  @IsOptional() @Type(() => Number) @IsInt() site_id?: number | null;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class UpdateAgentDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) agent_code?: string;
  @IsOptional() @Type(() => Number) @IsInt() site_id?: number | null;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @ToBool() @IsBoolean() enabled?: boolean;
}

export class WifiConfigDto {
  @IsOptional() @ToBool() @IsBoolean() wifi_enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(100) snmp_profile?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(30) @Max(86400) wifi_poll_interval_sec?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) wifi_max_clients?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) wifi_warn_utilization?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) wifi_critical_utilization?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-120) @Max(0) wifi_warn_noise_dbm?: number;
}

export class SwitchConfigDto {
  @IsOptional() @ToBool() @IsBoolean() switch_enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(100) switch_snmp_profile?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(60) @Max(86400) switch_poll_interval_sec?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) crc_warn_delta?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) uplink_utilization_pct?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1440) uplink_hold_minutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(96) storm_min_ports?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) storm_discard_delta?: number;
}

class DeviceInventoryDto extends WifiConfigDto {
  @IsOptional() @IsString() @MaxLength(80) inventory_number?: string;
  @IsOptional() @IsString() @MaxLength(80) asset_number?: string;
  @IsOptional() @IsString() @MaxLength(150) hostname?: string;
  @IsOptional() @IsString() @MaxLength(150) fqdn?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsString() @MaxLength(80) subcategory?: string;
  @IsOptional() @IsString() @MaxLength(120) manufacturer?: string;
  @IsOptional() @IsString() @MaxLength(160) model?: string;
  @IsOptional() @IsString() @MaxLength(160) serial_number?: string;
  @IsOptional() @IsString() @MaxLength(160) part_number?: string;
  @IsOptional() @IsString() @MaxLength(160) service_tag?: string;
  @IsOptional() @IsString() @MaxLength(32) mac_address?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4094) management_vlan?: number | null;
  @IsOptional() @IsString() @MaxLength(80) subnet_mask?: string;
  @IsOptional() @IsString() @MaxLength(80) gateway?: string;
  @IsOptional() @IsString() @MaxLength(255) dns_servers?: string;
  @IsOptional() @IsIn(['static','dhcp','other']) addressing_method?: string;
  @IsOptional() @IsString() @MaxLength(160) firmware?: string;
  @IsOptional() @IsString() @MaxLength(160) operating_system?: string;
  @IsOptional() @IsString() @MaxLength(160) os_version?: string;
  @IsOptional() @IsString() @MaxLength(150) building?: string;
  @IsOptional() @IsString() @MaxLength(80) floor?: string;
  @IsOptional() @IsString() @MaxLength(180) area?: string;
  @IsOptional() @IsString() @MaxLength(180) room?: string;
  @IsOptional() @IsString() @MaxLength(100) rack_name?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) rack_unit?: number | null;
  @IsOptional() @IsString() @MaxLength(180) physical_location?: string;
  @IsOptional() @IsString() @MaxLength(180) responsible_person?: string;
  @IsOptional() @IsString() @MaxLength(180) administrative_unit?: string;
  @IsOptional() @IsString() @MaxLength(180) supplier?: string;
  @IsOptional() @IsDateString() acquisition_date?: string | null;
  @IsOptional() @IsDateString() warranty_end?: string | null;
  @IsOptional() @IsString() @MaxLength(180) contract_reference?: string;
  @IsOptional() @IsIn(['active','maintenance','reserve','replaced','retired']) lifecycle_status?: string;
  @IsOptional() @IsIn(['low','medium','high','critical']) criticality?: string;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;
}

export class CreateDeviceDto extends DeviceInventoryDto {
  @Type(() => Number) @IsInt() site_id!: number;
  @IsOptional() @Type(() => Number) @IsInt() probe_id?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() parent_id?: number | null;
  @IsString() @MinLength(1) @MaxLength(150) name!: string;
  @IsString() @MinLength(1) @MaxLength(255) host!: string;
  @IsOptional() @IsString() @MaxLength(50) device_type?: string;
  @IsOptional() @IsIn(['ping', 'tcp', 'dns', 'https']) check_type?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535) check_port?: number | null;
  @IsOptional() @IsString() @MaxLength(255) check_path?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(86400) interval_sec?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) warning_ms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) critical_ms?: number;
  @IsOptional() @ToBool() @IsBoolean() enabled?: boolean;
}

export class UpdateDeviceDto extends DeviceInventoryDto {
  @IsOptional() @Type(() => Number) @IsInt() site_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() probe_id?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() parent_id?: number | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) host?: string;
  @IsOptional() @IsString() @MaxLength(50) device_type?: string;
  @IsOptional() @IsIn(['ping', 'tcp', 'dns', 'https']) check_type?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535) check_port?: number | null;
  @IsOptional() @IsString() @MaxLength(255) check_path?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(86400) interval_sec?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) warning_ms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) critical_ms?: number;
  @IsOptional() @ToBool() @IsBoolean() enabled?: boolean;
}

export class DeviceInterfaceDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(32) mac_address?: string | null;
  @IsOptional() @IsString() @MaxLength(80) ipv4_address?: string | null;
  @IsOptional() @IsString() @MaxLength(80) ipv6_address?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4094) vlan_id?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) speed_mbps?: number | null;
  @IsOptional() @IsString() @MaxLength(60) interface_type?: string;
  @IsOptional() @Type(() => Number) @IsInt() switch_device_id?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() switch_if_index?: number | null;
  @IsOptional() @IsString() @MaxLength(100) switch_port_name?: string | null;
  @IsOptional() @IsString() @MaxLength(100) wall_jack?: string | null;
  @IsOptional() @IsString() @MaxLength(100) patch_panel?: string | null;
  @IsOptional() @IsString() @MaxLength(60) patch_port?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
  @IsOptional() @ToBool() @IsBoolean() primary_interface?: boolean;
}

export class PortConfigDto {
  @IsOptional() @IsString() @MaxLength(180) custom_name?: string | null;
  @IsOptional() @ToBool() @IsBoolean() critical?: boolean;
  @IsOptional() @ToBool() @IsBoolean() is_uplink?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(1000000) expected_speed_mbps?: number | null;
  @IsOptional() @ToBool() @IsBoolean() enabled?: boolean;
}
