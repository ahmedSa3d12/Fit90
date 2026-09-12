import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ChangeCustomerPasswordDto, CreateMobileFeedbackDto, CreateMobileInvitationDto, CreateMobileTicketDto, DeleteCustomerAccountDto, MobileCustomerLoginDto } from './dto/mobile-app-content.dto';
import { MobileAppContentService } from './mobile-app-content.service';
import { CustomerJwtGuard } from './customer-jwt.guard';
import type { CustomerJwt } from './customer-jwt.strategy';

@Controller('mobile/app')
export class MobileAppContentController {
  constructor(private readonly service: MobileAppContentService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: MobileCustomerLoginDto) {
    return this.service.login(dto);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Get('profile')
  profile(@Req() req: Request) {
    const user = req.user as CustomerJwt;
    return this.service.profile(user.sub, user.memberId);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Patch('profile/picture')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  updateProfilePicture(@Req() req: Request, @UploadedFile() file: Express.Multer.File) {
    const user = req.user as CustomerJwt;
    return this.service.updateProfilePicture(user.sub, user.memberId, file);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Patch('profile/password')
  changePassword(@Req() req: Request, @Body() dto: ChangeCustomerPasswordDto) {
    const user = req.user as CustomerJwt;
    return this.service.changePassword(user.sub, user.memberId, dto);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Delete('account')
  deleteAccount(@Req() req: Request, @Body() dto: DeleteCustomerAccountDto) {
    const user = req.user as CustomerJwt;
    return this.service.deleteAccount(user.sub, user.memberId, dto);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Get('inbody-measurements')
  inbodyMeasurements(@Req() req: Request) {
    const user = req.user as CustomerJwt;
    return this.service.inbodyMeasurements(user.sub, user.memberId);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Get('inbody-measurements/:id')
  inbodyMeasurement(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req.user as CustomerJwt;
    return this.service.inbodyMeasurement(user.sub, user.memberId, id);
  }

  @Public()
  @Get('ads')
  ads() {
    return this.service.listContent('ads');
  }

  @Public()
  @Get('ads/:id')
  ad(@Param('id', ParseIntPipe) id: number) {
    return this.service.getContent('ads', id);
  }

  @Public()
  @Get('offers')
  offers() {
    return this.service.listContent('offers');
  }

  @Public()
  @Get('offers/:id')
  offer(@Param('id', ParseIntPipe) id: number) {
    return this.service.getContent('offers', id);
  }

  @Public()
  @Get('faqs')
  faqs() {
    return this.service.listContent('faqs');
  }

  @Public()
  @Get('exercises')
  exercises() {
    return this.service.listContent('exercises');
  }

  @Public()
  @Get('exercises/:id')
  exercise(@Param('id', ParseIntPipe) id: number) {
    return this.service.getContent('exercises', id);
  }

  @Public()
  @Get('terms-and-conditions')
  termsAndConditions() {
    return this.service.termsAndConditions();
  }

  @Public()
  @Get('privacy-policy')
  privacyPolicy() {
    return this.service.privacyPolicy();
  }

  @Public()
  @Get('about')
  about() {
    return this.service.about();
  }

  @Public()
  @Get('trainers')
  trainers(@Query('branchId') branchId?: string) {
    return this.service.trainers(branchId);
  }

  @Public()
  @Get('subscription-types')
  subscriptionTypes(@Query('branchId') branchId?: string) {
    return this.service.subscriptionTypes(branchId);
  }

  @Public()
  @Get('subscription-types/:id')
  subscriptionType(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.subscriptionType(id, branchId);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Get('points')
  points(@Req() req: Request) {
    const user = req.user as CustomerJwt;
    return this.service.points(user.sub, user.memberId);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Get('points/history')
  pointsHistory(@Req() req: Request, @Query('limit') limit?: string) {
    const user = req.user as CustomerJwt;
    return this.service.pointsHistory(user.sub, user.memberId, limit);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Get('subscriptions')
  subscriptions(@Req() req: Request) {
    const user = req.user as CustomerJwt;
    return this.service.subscriptions(user.sub, user.memberId);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Get('subscriptions/freeze-history')
  freezeHistory(@Req() req: Request) {
    const user = req.user as CustomerJwt;
    return this.service.freezeHistory(user.sub, user.memberId);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Get('notifications')
  notifications(@Req() req: Request, @Query('limit') limit?: string) {
    const user = req.user as CustomerJwt;
    return this.service.notifications(user.sub, user.memberId, limit);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Patch('notifications/read-all')
  markAllNotificationsRead(@Req() req: Request) {
    const user = req.user as CustomerJwt;
    return this.service.markAllNotificationsRead(user.sub, user.memberId);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Patch('notifications/:id/read')
  markNotificationRead(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req.user as CustomerJwt;
    return this.service.markNotificationRead(user.sub, user.memberId, id);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('tickets')
  createTicket(@Body() dto: CreateMobileTicketDto) {
    return this.service.createTicket(dto);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('feedback')
  createFeedback(@Body() dto: CreateMobileFeedbackDto) {
    return this.service.createFeedback(dto);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('invitations')
  @HttpCode(201)
  createInvitation(@Body() dto: CreateMobileInvitationDto) {
    return this.service.createInvitation(dto);
  }
}
