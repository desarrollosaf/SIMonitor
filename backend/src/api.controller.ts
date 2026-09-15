import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiService } from './api.service';
import { JwtAuthGuard, ProbeGuard } from './auth.guard';
import {
  CreateAgentDto, CreateDeviceDto, CreateSiteDto, CreateVlanDto, DeviceInterfaceDto, PortConfigDto,
  SwitchConfigDto, UpdateAgentDto, UpdateDeviceDto, UpdateSiteDto, UpdateVlanDto, WifiConfigDto
} from './dto';

@Controller()
export class ApiController {
  constructor(private api: ApiService) {}
  @Get('health') health() { return { ok: true, version: '0.4.2', architecture: 'multisite-agent', time: new Date().toISOString() }; }
}

@Controller() @UseGuards(JwtAuthGuard)
export class UserApiController {
  constructor(private api: ApiService) {}

  @Get('dashboard/summary') summary() { return this.api.summary(); }

  @Get('sites') sites() { return this.api.sites(); }
  @Post('sites') createSite(@Req() req:any,@Body() b: CreateSiteDto) { return this.api.createSite(b,req.user?.username); }
  @Patch('sites/:id') updateSite(@Req() req:any,@Param('id',ParseIntPipe) id:number,@Body() b:UpdateSiteDto){ return this.api.updateSite(id,b,req.user?.username); }
  @Get('vlans') vlans(@Query('site_id') siteId?:string){ return this.api.vlans(siteId||undefined); }
  @Get('sites/:id/vlans') siteVlans(@Param('id',ParseIntPipe) id:number){ return this.api.vlans(id); }
  @Post('sites/:id/vlans') createVlan(@Req() req:any,@Param('id',ParseIntPipe) id:number,@Body() b:CreateVlanDto){ return this.api.createVlan(id,b,req.user?.username); }
  @Patch('vlans/:id') updateVlan(@Req() req:any,@Param('id',ParseIntPipe) id:number,@Body() b:UpdateVlanDto){ return this.api.updateVlan(id,b,req.user?.username); }
  @Delete('vlans/:id') deleteVlan(@Req() req:any,@Param('id',ParseIntPipe) id:number){ return this.api.deleteVlan(id,req.user?.username); }

  @Delete('sites/:id') deleteSite(@Req() req:any,@Param('id',ParseIntPipe) id:number){ return this.api.deleteSite(id,req.user?.username); }

  // "probes" se conserva por compatibilidad; la UI V0.4 usa el término Agente de Sitio.
  @Get('probes') probes() { return this.api.probes(); }
  @Get('agents') agents() { return this.api.probes(); }
  @Post('agents') createAgent(@Req() req:any,@Body() b:CreateAgentDto){ return this.api.createAgent(b,req.user?.username); }
  @Patch('agents/:id') updateAgent(@Req() req:any,@Param('id',ParseIntPipe) id:number,@Body() b:UpdateAgentDto){ return this.api.updateAgent(id,b,req.user?.username); }
  @Delete('agents/:id') deleteAgent(@Req() req:any,@Param('id',ParseIntPipe) id:number){ return this.api.deleteAgent(id,req.user?.username); }
  @Post('agents/:id/token') rotateAgentToken(@Req() req:any,@Param('id',ParseIntPipe) id:number){ return this.api.regenerateAgentToken(id,req.user?.username); }

  @Get('devices') devices(@Query() q:any) { return this.api.devices(q); }
  @Get('devices/:id') device(@Param('id',ParseIntPipe) id:number){ return this.api.deviceDetail(id); }
  @Post('devices') createDevice(@Req() req:any,@Body() b: CreateDeviceDto) { return this.api.createDevice(b,req.user?.username); }
  @Patch('devices/:id') updateDevice(@Req() req:any,@Param('id', ParseIntPipe) id: number, @Body() b: UpdateDeviceDto) { return this.api.updateDevice(id, b,req.user?.username); }
  @Delete('devices/:id') deleteDevice(@Req() req:any,@Param('id', ParseIntPipe) id: number) { return this.api.deleteDevice(id,req.user?.username); }

  @Get('devices/:id/interfaces') interfaces(@Param('id',ParseIntPipe) id:number){ return this.api.deviceInterfaces(id); }
  @Post('devices/:id/interfaces') addInterface(@Req() req:any,@Param('id',ParseIntPipe) id:number,@Body() b:DeviceInterfaceDto){ return this.api.addDeviceInterface(id,b,req.user?.username); }
  @Patch('interfaces/:id') updateInterface(@Req() req:any,@Param('id',ParseIntPipe) id:number,@Body() b:DeviceInterfaceDto){ return this.api.updateDeviceInterface(id,b,req.user?.username); }
  @Delete('interfaces/:id') deleteInterface(@Req() req:any,@Param('id',ParseIntPipe) id:number){ return this.api.deleteDeviceInterface(id,req.user?.username); }

  @Get('analytics/sites') siteAnalytics(@Query('days') days?:string){ return this.api.siteAnalytics(Number(days||30)); }
  @Get('analytics/inventory') inventoryAnalytics(){ return this.api.inventoryAnalytics(); }

  @Get('monitor/events') monitorEvents() { return this.api.monitorEvents(); }
  @Get('incidents') incidents() { return this.api.incidents(); }
  @Get('results/:id') results(@Param('id', ParseIntPipe) id: number) { return this.api.results(id); }

  @Get('wifi/summary') wifiSummary() { return this.api.wifiSummary(); }
  @Get('wifi/history/:id') wifiHistory(@Param('id', ParseIntPipe) id: number) { return this.api.wifiHistory(id); }
  @Get('wifi/config/:id') wifiConfig(@Param('id', ParseIntPipe) id: number) { return this.api.wifiConfig(id); }
  @Patch('wifi/config/:id') updateWifiConfig(@Param('id', ParseIntPipe) id: number, @Body() b: WifiConfigDto) { return this.api.upsertWifiConfig(id, b); }
  @Delete('wifi/config/:id') deleteWifiConfig(@Req() req:any,@Param('id', ParseIntPipe) id: number) { return this.api.deleteWifiConfig(id,req.user?.username); }

  @Get('switches/summary') switchSummary() { return this.api.switchSummary(); }
  @Get('ports/problems') portProblems() { return this.api.portProblems(); }
  @Get('switches/:id/config') switchConfig(@Param('id', ParseIntPipe) id:number){ return this.api.switchConfig(id); }
  @Patch('switches/:id/config') updateSwitchConfig(@Param('id', ParseIntPipe) id:number,@Body() b:SwitchConfigDto){ return this.api.upsertSwitchConfig(id,b); }
  @Delete('switches/:id/config') deleteSwitchConfig(@Req() req:any,@Param('id', ParseIntPipe) id:number){ return this.api.deleteSwitchConfig(id,req.user?.username); }
  @Get('switches/:id/ports') switchPorts(@Param('id', ParseIntPipe) id:number){ return this.api.switchPorts(id); }
  @Patch('switches/:id/ports/:ifIndex') updatePort(@Param('id',ParseIntPipe) id:number,@Param('ifIndex',ParseIntPipe) ifIndex:number,@Body() b:PortConfigDto){ return this.api.updatePortConfig(id,ifIndex,b); }
  @Delete('switches/:id/ports/:ifIndex') resetPort(@Req() req:any,@Param('id',ParseIntPipe) id:number,@Param('ifIndex',ParseIntPipe) ifIndex:number){ return this.api.deletePortConfig(id,ifIndex,req.user?.username); }
  @Get('switches/:id/ports/:ifIndex/history') switchPortHistory(@Param('id',ParseIntPipe) id:number,@Param('ifIndex',ParseIntPipe) ifIndex:number){ return this.api.switchPortHistory(id,ifIndex); }
}

@Controller('probe') @UseGuards(ProbeGuard)
export class ProbeApiController {
  constructor(private api: ApiService) {}
  @Get('config') probeConfig(@Req() req:any) { return this.api.probeConfig(req.probeTokenHash); }
  @Post('heartbeat') heartbeat(@Req() req:any,@Body() b: any) { return this.api.heartbeat(b,req.probeTokenHash); }
  @Post('result') result(@Req() req:any,@Body() b: any) { return this.api.ingestResult(b,req.probeTokenHash); }
  @Post('wifi-result') wifiResult(@Req() req:any,@Body() b: any) { return this.api.ingestWifiResult(b,req.probeTokenHash); }
  @Post('switch-result') switchResult(@Req() req:any,@Body() b:any){ return this.api.ingestSwitchResult(b,req.probeTokenHash); }
}
