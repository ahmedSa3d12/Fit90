import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface CustomerJwt {
  sub: number;
  actorType: 'customer';
  memberId: number;
}

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.refreshSecret')!,
    });
  }

  validate(payload: CustomerJwt): CustomerJwt {
    if (payload.actorType !== 'customer' || !payload.sub || !payload.memberId) {
      throw new UnauthorizedException('Invalid customer token');
    }
    return payload;
  }
}
